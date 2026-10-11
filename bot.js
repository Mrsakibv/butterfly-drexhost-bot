const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

// ============================================================
// CONFIG
// ============================================================

// তোমার AFK Rewards page URL এখানে বসাও
const WEBSITE = "https://dash.drexhost.in/afk";

// Railway Volume-এ /data/storage-state.json সেট করবে।
// লোকাল পরীক্ষায় ./storage-state.json ব্যবহার হবে।
// Prefer Railway's secret variable. The state file is written only to the container's temporary directory.
const AUTH_STATE_B64 = process.env.AUTH_STATE_B64;
const STATE_PATH = process.env.STATE_PATH || (AUTH_STATE_B64
  ? path.join('/tmp', 'storage-state.json')
  : path.join(__dirname, 'storage-state.json'));

if (AUTH_STATE_B64) {
  try {
    fs.writeFileSync(STATE_PATH, Buffer.from(AUTH_STATE_B64, 'base64'));
    console.log('Loaded authentication state from AUTH_STATE_B64.');
  } catch (error) {
    console.error('Could not decode AUTH_STATE_B64:', error.message);
    process.exit(1);
  }
}


// ============================================================
// START BOT
// ============================================================

(async () => {

  console.log("");
  console.log("============================================");
  console.log("       AFK REWARDS TEST BOT");
  console.log("============================================");
  console.log("");

  // ----------------------------------------------------------
  // OPEN CHROMIUM
  // ----------------------------------------------------------

  if (!fs.existsSync(STATE_PATH)) {
    console.error(`Saved login state not found: ${STATE_PATH}`);
    console.error("Run 'npm run auth' locally, then set AUTH_STATE_B64 in Railway Variables to the Base64 contents of storage-state.json.");
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const context = await browser.newContext({
    storageState: STATE_PATH,
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // Refresh the saved cookies/local storage periodically in the mounted Volume.
  const stateSaver = setInterval(async () => {
    try {
      await context.storageState({ path: STATE_PATH });
      console.log("Login state saved.");
    } catch (error) {
      console.error("Could not save login state:", error.message);
    }
  }, 60_000);


  // ----------------------------------------------------------
  // OPEN WEBSITE
  // ----------------------------------------------------------

  console.log("Opening AFK Rewards page...");

  await page.goto(WEBSITE, {
    waitUntil: "domcontentloaded"
  });

  console.log("Website opened.");
  console.log("");


  console.log("Using saved Discord OAuth session (headless mode).");
  console.log("If the site asks you to sign in again, stop the service and refresh storage-state.json locally.");


  // ----------------------------------------------------------
  // START AFK
  // ----------------------------------------------------------

  console.log("");
  console.log("Looking for AFK button...");

  // তোমার site-এ running অবস্থায় "Stop AFK" দেখা যায়।
  // তাই প্রথমে Start AFK খুঁজছি।

  const startAFK = page.getByRole("button", {
    name: "Start AFK",
    exact: true
  });

  if (await startAFK.count() > 0) {

    if (await startAFK.first().isVisible()) {

      console.log("Start AFK found.");

      await startAFK.first().click();

      console.log("AFK started.");

    }

  } else {

    // যদি আগে থেকেই AFK running থাকে
    const stopAFK = page.getByRole("button", {
      name: "Stop AFK",
      exact: true
    });

    if (await stopAFK.count() > 0) {

      console.log(
        "AFK is already running."
      );

    } else {

      console.log(
        "Start AFK button পাওয়া যায়নি."
      );

      await page.screenshot({
        path: "afk-error.png",
        fullPage: true
      });

      clearInterval(stateSaver);
      await context.storageState({ path: STATE_PATH }).catch(() => {});
      await context.close();
      await browser.close();
      return;
    }
  }


  console.log("");
  console.log("============================================");
  console.log("AFK SESSION ACTIVE");
  console.log("============================================");
  console.log("");


  // ----------------------------------------------------------
  // GAME LOOP
  // ----------------------------------------------------------

  let round = 0;

  process.on("SIGTERM", async () => {
    clearInterval(stateSaver);
    try { await context.storageState({ path: STATE_PATH }); } catch {}
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
    process.exit(0);
  });

  while (true) {

    round++;

    console.log("--------------------------------------------");
    console.log(`ROUND ${round}`);
    console.log("--------------------------------------------");

    try {

      // ------------------------------------------------------
      // CHECK YOUR TURN
      // ------------------------------------------------------

      const yourTurn = page.getByText(
        "Your turn (X)",
        {
          exact: true
        }
      );

      if (!(await yourTurn.isVisible())) {

        console.log(
          "Waiting for Your turn (X)..."
        );

        await page.waitForTimeout(700);

        continue;
      }


      console.log(
        "Your turn detected."
      );


      // ------------------------------------------------------
      // FIND ALL 9 CELLS
      // ------------------------------------------------------

      const cells = page.locator(
        'button[aria-label^="Cell "]'
      );

      const count = await cells.count();

      console.log(
        `Found ${count} Tic-Tac-Toe cells.`
      );


      if (count !== 9) {

        console.log(
          "Expected 9 cells."
        );

        await page.waitForTimeout(1000);

        continue;
      }


      // ------------------------------------------------------
      // FIND ENABLED CELL
      // ------------------------------------------------------

      let clicked = false;

      for (let i = 1; i <= 9; i++) {

        const cell = page.getByRole("button", {
          name: `Cell ${i}`,
          exact: true
        });

        const visible =
          await cell.isVisible();

        const enabled =
          await cell.isEnabled();

        if (!visible || !enabled) {
          continue;
        }


        console.log(
          `Clicking Cell ${i}...`
        );

        await cell.click();

        console.log(
          `Cell ${i} clicked.`
        );

        clicked = true;

        break;
      }


      // ------------------------------------------------------
      // NO CELL AVAILABLE
      // ------------------------------------------------------

      if (!clicked) {

        console.log(
          "No enabled cell available."
        );

        await page.waitForTimeout(1000);

        continue;
      }


      // ------------------------------------------------------
      // WAIT FOR BOT
      // ------------------------------------------------------

      console.log(
        "Waiting for bot move..."
      );

      await page.waitForTimeout(1200);


      // ------------------------------------------------------
      // CHECK IF RESTART IS AVAILABLE
      // ------------------------------------------------------

      const restart = page.getByRole("button", {
        name: "Restart",
        exact: true
      });


      if (
        await restart.count() > 0 &&
        await restart.first().isVisible()
      ) {

        console.log(
          "Restart button found."
        );

        await restart.first().click();

        console.log(
          "Game restarted."
        );

      } else {

        console.log(
          "Restart not available yet."
        );
      }


      // ------------------------------------------------------
      // WAIT BEFORE NEXT ROUND
      // ------------------------------------------------------

      await page.waitForTimeout(1000);

    } catch (error) {

      console.log("");
      console.log("ROUND ERROR");
      console.log("--------------------------------------------");
      console.log(error.message);
      console.log("--------------------------------------------");
      console.log("");

      await page.waitForTimeout(2000);
    }
  }

})();