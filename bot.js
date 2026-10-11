const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

// ============================================================
// CONFIG
// ============================================================

const WEBSITE = "https://dash.drexhost.in/afk";

const AUTH_STATE_B64 = process.env.AUTH_STATE_B64;

const STATE_PATH =
  process.env.STATE_PATH ||
  (AUTH_STATE_B64
    ? "/tmp/storage-state.json"
    : path.join(__dirname, "storage-state.json"));

// ============================================================
// AUTH STATE
// ============================================================

if (AUTH_STATE_B64) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), {
      recursive: true
    });

    fs.writeFileSync(
      STATE_PATH,
      Buffer.from(AUTH_STATE_B64, "base64")
    );

    console.log("Loaded authentication state from AUTH_STATE_B64.");
  } catch (error) {
    console.error(
      "Could not load authentication state:",
      error.message
    );

    process.exit(1);
  }
}

// ============================================================
// BOT
// ============================================================

(async () => {
  let browser;
  let context;
  let stateSaver;
  let shuttingDown = false;

  async function cleanup() {
    if (shuttingDown) return;
    shuttingDown = true;

    if (stateSaver) {
      clearInterval(stateSaver);
    }

    if (context) {
      try {
        await context.storageState({
          path: STATE_PATH
        });
      } catch (error) {
        console.log(
          "Could not save login state:",
          error.message
        );
      }

      try {
        await context.close();
      } catch {}
    }

    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }

  process.once("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  process.once("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });

  try {
    console.log("");
    console.log("============================================");
    console.log("       AFK REWARDS TEST BOT");
    console.log("       BUILD: AFK-NAV-FIX-2");
    console.log("============================================");

    if (!fs.existsSync(STATE_PATH)) {
      throw new Error(
        `Authentication state not found: ${STATE_PATH}. ` +
        "Configure AUTH_STATE_B64 in Railway Variables."
      );
    }

    // --------------------------------------------------------
    // LAUNCH BROWSER
    // --------------------------------------------------------

    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"]
    });

    context = await browser.newContext({
      storageState: STATE_PATH,
      viewport: {
        width: 1280,
        height: 900
      }
    });

    const page = await context.newPage();

    stateSaver = setInterval(async () => {
      try {
        await context.storageState({
          path: STATE_PATH
        });

        console.log("Login state saved.");
      } catch (error) {
        console.error(
          "Could not save login state:",
          error.message
        );
      }
    }, 60000);

    // --------------------------------------------------------
    // OPEN WEBSITE
    // --------------------------------------------------------

    console.log("Opening AFK Rewards page...");

    await page.goto(WEBSITE, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(4000);

    console.log("Website opened.");
    console.log("Current URL:", page.url());
    console.log("Page title:", await page.title());
    console.log("Using saved Discord OAuth session.");

    // --------------------------------------------------------
    // HELPERS
    // --------------------------------------------------------

    async function firstVisible(locator) {
      const count = await locator.count();

      for (let i = 0; i < count; i++) {
        const item = locator.nth(i);

        try {
          if (await item.isVisible()) {
            return item;
          }
        } catch {}
      }

      return null;
    }

    async function findAFKControl(action) {
      const pattern =
        action === "start"
          ? /start[\s-]*afk/i
          : /stop[\s-]*afk/i;

      const candidates = [
        page.getByRole("button", {
          name: pattern
        }),

        page.locator("button").filter({
          hasText: pattern
        }),

        page.locator('[role="button"]').filter({
          hasText: pattern
        })
      ];

      for (const candidate of candidates) {
        const item = await firstVisible(candidate);

        if (item) {
          return item;
        }
      }

      return null;
    }

    // --------------------------------------------------------
    // FIND AFK BUTTON
    // --------------------------------------------------------

    console.log("Looking for AFK controls...");

    let startAFK = await findAFKControl("start");
    let stopAFK = await findAFKControl("stop");

    // If controls are missing, try opening the sidebar menu.
    if (!startAFK && !stopAFK) {
      console.log("AFK controls not visible yet.");
      console.log("Searching for AFK Rewards menu...");

      const menuItems = page.getByText(
        /AFK\s*Rewards/i
      );

      const menuCount = await menuItems.count();

      console.log("AFK Rewards text matches:", menuCount);

      let menuClicked = false;

      for (let i = 0; i < menuCount; i++) {
        const item = menuItems.nth(i);

        try {
          if (!(await item.isVisible())) {
            continue;
          }

          console.log("Clicking AFK Rewards menu...");

          await item.click({
            timeout: 5000
          });

          menuClicked = true;
          break;
        } catch (error) {
          console.log(
            "Menu click attempt failed:",
            error.message
          );
        }
      }

      if (menuClicked) {
        await page.waitForTimeout(4000);
      } else {
        console.log("Could not click the AFK Rewards menu.");
      }
    }

    // Search again after navigation.
    console.log("URL after navigation:", page.url());

    startAFK = await findAFKControl("start");
    stopAFK = await findAFKControl("stop");

    // --------------------------------------------------------
    // START AFK OR DETECT EXISTING SESSION
    // --------------------------------------------------------

    if (startAFK) {
      console.log("Start AFK control found.");

      await startAFK.click({
        timeout: 10000
      });

      await page.waitForTimeout(2000);

      console.log("Start AFK button clicked.");
    } else if (stopAFK) {
      console.log("AFK is already running.");
    } else {
      console.log("");
      console.log("AFK controls could not be found.");

      // Output visible controls to diagnose the actual page.
      const controls = await page
        .locator(
          "button, [role='button'], a, [role='link'], " +
          "input[type='button'], input[type='submit']"
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) =>
              element.getClientRects().length > 0
            )
            .slice(0, 60)
            .map((element) => ({
              tag: element.tagName,
              text: (
                element.innerText ||
                element.value ||
                element.textContent ||
                ""
              )
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 120),
              aria: element.getAttribute("aria-label"),
              title: element.getAttribute("title"),
              href: element.getAttribute("href")
            }))
        );

      console.log(
        "Visible controls:",
        JSON.stringify(controls)
      );

      const headings = await page
        .locator("h1, h2, h3")
        .evaluateAll((elements) =>
          elements
            .filter((element) =>
              element.getClientRects().length > 0
            )
            .map((element) =>
              (element.innerText || "").trim()
            )
        );

      console.log(
        "Visible headings:",
        JSON.stringify(headings)
      );

      console.log(
        "Stopping so the diagnostic logs can be checked."
      );

      await cleanup();
      return;
    }

    // --------------------------------------------------------
    // ACTIVE SESSION
    // --------------------------------------------------------

    console.log("");
    console.log("============================================");
    console.log("AFK SESSION ACTIVE");
    console.log("============================================");

    // --------------------------------------------------------
    // TIC-TAC-TOE GAME LOOP
    // --------------------------------------------------------

    let round = 0;

    while (true) {
      round++;

      console.log("--------------------------------------------");
      console.log(`ROUND ${round}`);
      console.log("--------------------------------------------");

      try {
        // Check if it is our turn.
        const yourTurn = page.getByText(
          "Your turn (X)",
          {
            exact: true
          }
        );

        if (!(await yourTurn.isVisible())) {
          console.log("Waiting for Your turn (X)...");

          await page.waitForTimeout(1000);
          continue;
        }

        console.log("Your turn detected.");

        // Find the nine game cells.
        const cells = page.locator(
          'button[aria-label^="Cell "]'
        );

        const cellCount = await cells.count();

        console.log(`Found ${cellCount} Tic-Tac-Toe cells.`);

        if (cellCount !== 9) {
          console.log("Expected 9 cells.");

          await page.waitForTimeout(1500);
          continue;
        }

        // Click the first visible, enabled cell.
        let clicked = false;

        for (let i = 1; i <= 9; i++) {
          const cell = page.getByRole("button", {
            name: `Cell ${i}`,
            exact: true
          });

          if (
            !(await cell.isVisible()) ||
            !(await cell.isEnabled())
          ) {
            continue;
          }

          console.log(`Clicking Cell ${i}...`);

          await cell.click();

          console.log(`Cell ${i} clicked.`);

          clicked = true;
          break;
        }

        if (!clicked) {
          console.log("No enabled cell available.");

          await page.waitForTimeout(1500);
          continue;
        }

        // Wait for the opponent's move.
        console.log("Waiting for bot move...");

        await page.waitForTimeout(1500);

        // Restart the game if the button is available.
        const restart = page.getByRole("button", {
          name: "Restart",
          exact: true
        });

        if (
          await restart.count() > 0 &&
          await restart.first().isVisible()
        ) {
          console.log("Restart button found.");

          await restart.first().click();

          console.log("Game restarted.");
        } else {
          console.log("Restart not available yet.");
        }

        await page.waitForTimeout(1000);
      } catch (error) {
        console.error("ROUND ERROR:", error.message);

        await page.waitForTimeout(2000);
      }
    }
  } catch (error) {
    console.error("FATAL BOT ERROR:", error.message);

    await cleanup();
    process.exitCode = 1;
  }
})();