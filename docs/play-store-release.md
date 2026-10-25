# Play Store release checklist

Step-by-step for shipping Merge Rush with ads. Items marked **(you)** need
your accounts; everything else is already in the code.

## 1. AdMob setup (you)

1. Create an AdMob account at https://admob.google.com and add an app:
   platform Android, "not listed on a store yet" (link it to the Play listing
   once it is live).
2. Copy the **App ID** (`ca-app-pub-…~…`) into `android/gradle.properties`:
   ```properties
   ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~NNNNNNNNNN
   ```
3. Create two ad units and copy their IDs (`ca-app-pub-…/…`) into
   `.env.production` (template: `.env.example`):

   | Ad unit name | Format | Env var |
   | ------------ | ------ | ------- |
   | Continue (revive) | Rewarded | `VITE_ADMOB_REWARDED_ID` |
   | Between games | Interstitial | `VITE_ADMOB_INTERSTITIAL_ID` |

4. **Privacy & messaging → GDPR:** create and publish a consent message for
   the app (the in-game consent form shows this message). Do the same under
   "US state regulations" if you serve US players.
5. **app-ads.txt:** put `docs/app-ads.txt` (with your `pub-` ID from AdMob
   → Settings) at the root of a website you control, e.g.
   `https://yourdomain.com/app-ads.txt`, and enter that website as the
   developer website in the Play listing. AdMob limits ad serving for apps
   it cannot verify.

Until steps 2–3 are done, builds show Google **test ads** (labelled "Test
Ad") and earn nothing; release builds print a Gradle warning about it.
Never click your own live ads; use test ads or register your phone as a
test device in AdMob.

## 2. Privacy policy (you)

Fill in the placeholders in `docs/privacy-policy.md` (publisher name, date,
contact email) and host it at a public URL (GitHub Pages, Google Sites, your
site). Play requires the URL for any app with ads.

## 3. Build the release

```bash
npm run build && npx cap sync android && cd android && ./gradlew assembleRelease bundleRelease
```

Upload `android/app/build/outputs/bundle/release/app-release.aab`. Raise
`versionCode` in `android/app/build.gradle` for every upload after the first.

## 4. Play Console (you)

**Create app:** game, free, contains ads.

**App content** (Policy → App content):

- **Privacy policy:** the URL from step 2.
- **Ads:** "Yes, my app contains ads".
- **App access:** all functionality available without special access.
- **Target audience:** 13+ only (13–15, 16–17, 18+). Choosing younger ages
  puts the app in the Families program, which needs certified ad SDKs and
  child-directed ad settings.
- **Content rating:** fill the IARC questionnaire (puzzle game, no violence,
  no user interaction, no purchases yet); expect Everyone / PEGI 3.
- **Data safety:** the game itself collects nothing; declare what the AdMob
  SDK collects. Check Google's current guide first
  (https://developers.google.com/admob/android/privacy/play-data-disclosure).
  At the time of writing it lists:
  - Device or other IDs (advertising ID): collected, shared, for
    advertising/marketing, analytics and fraud prevention;
  - Approximate location (from IP): collected, for advertising and
    fraud prevention;
  - App interactions, diagnostics and other app performance data:
    collected, for analytics/advertising.
  - Data is encrypted in transit; users can reset the advertising ID.
- **Advertising ID:** "Yes, the app uses an advertising ID" — for
  advertising/marketing. (The AdMob SDK adds the `AD_ID` permission.)

**Store listing:**

- App name "Merge Rush", short description (≤ 80 chars), full description.
- App icon 512×512 PNG, feature graphic 1024×500, at least 2 phone
  screenshots (portrait).
- Category: Puzzle. Contact email. Developer website (hosts app-ads.txt).

**App signing:** let Google manage the app signing key (Play App Signing).
Our `android/merge-rush-release.jks` becomes the **upload key**. Keep it and
`android/keystore.properties` backed up.

## 5. Testing before production (you)

- Personal developer accounts created after November 2023 must run a
  **closed test with at least 12 testers opted in for 14 days** before they
  can apply for production access. Start this as soon as the first build is
  uploaded.
- Use an **internal testing** track first for quick installs on your own
  phones.
- On a real phone, check: consent form on first launch (use a VPN to an EEA
  country, or AdMob's test-device settings), the "Continue?" rewarded ad, the
  interstitial on Play Again (from the 3rd game, at most every 3rd game and
  4 minutes apart), and that the game resumes with sound after each ad.

## Ad placements (phase 1)

| Placement | Type | When | Limit |
| --------- | ---- | ---- | ----- |
| Continue (revive) | Rewarded, opt-in | Board stuck with no rescues or charges left; shown before the final score | Once per game; grants +1 rescue and +1 Bomb |
| Between games | Interstitial | Tapping Play Again / New game after a finished game | Not in the first 2 games; ≥ 2 ad-free games and ≥ 4 min between; skipped after games under 60 s or where a rewarded ad was watched |

Rules live in `src/ads/adPolicy.ts` (`AD_POLICY`) and
`src/game/constants.ts` (`REVIVE_RESCUES`, `REVIVE_BOMBS`).
