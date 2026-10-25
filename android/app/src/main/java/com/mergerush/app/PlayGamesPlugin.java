package com.mergerush.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;

/**
 * Minimal Google Play Games Services bridge: silent sign-in, score submit and
 * the built-in leaderboard screen. Inert until PGS_APP_ID is set in
 * android/gradle.properties (it defaults to "0"), so builds without a Play
 * Games project behave exactly as before.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {
    private static final int RC_LEADERBOARD = 9004;
    private boolean sdkReady = false;

    private boolean configured() {
        String id = getContext().getString(R.string.game_services_project_id);
        return id != null && !id.isEmpty() && !id.equals("0");
    }

    private boolean ensureSdk() {
        if (!configured()) return false;
        if (!sdkReady) {
            PlayGamesSdk.initialize(getContext());
            sdkReady = true;
        }
        return true;
    }

    private static JSObject result(String key, boolean value) {
        JSObject r = new JSObject();
        r.put(key, value);
        return r;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(result("available", configured()));
    }

    /** Signs in silently when possible; resolves { signedIn } and never rejects. */
    @PluginMethod
    public void signIn(PluginCall call) {
        if (!ensureSdk()) {
            call.resolve(result("signedIn", false));
            return;
        }
        try {
            PlayGames.getGamesSignInClient(getActivity())
                .isAuthenticated()
                .addOnCompleteListener(task -> {
                    if (task.isSuccessful() && task.getResult().isAuthenticated()) {
                        call.resolve(result("signedIn", true));
                        return;
                    }
                    PlayGames.getGamesSignInClient(getActivity())
                        .signIn()
                        .addOnCompleteListener(signIn ->
                            call.resolve(result(
                                "signedIn",
                                signIn.isSuccessful() && signIn.getResult().isAuthenticated())));
                });
        } catch (Exception e) {
            call.resolve(result("signedIn", false));
        }
    }

    @PluginMethod
    public void submitScore(PluginCall call) {
        String leaderboardId = call.getString("leaderboardId");
        Long score = call.getLong("score");
        if (!ensureSdk() || leaderboardId == null || score == null) {
            call.resolve(result("submitted", false));
            return;
        }
        try {
            PlayGames.getLeaderboardsClient(getActivity()).submitScore(leaderboardId, score);
            call.resolve(result("submitted", true));
        } catch (Exception e) {
            call.resolve(result("submitted", false));
        }
    }

    @PluginMethod
    public void showLeaderboard(PluginCall call) {
        String leaderboardId = call.getString("leaderboardId");
        if (!ensureSdk() || leaderboardId == null) {
            call.resolve(result("shown", false));
            return;
        }
        try {
            PlayGames.getLeaderboardsClient(getActivity())
                .getLeaderboardIntent(leaderboardId)
                .addOnSuccessListener(intent -> {
                    getActivity().startActivityForResult(intent, RC_LEADERBOARD);
                    call.resolve(result("shown", true));
                })
                .addOnFailureListener(e -> call.resolve(result("shown", false)));
        } catch (Exception e) {
            call.resolve(result("shown", false));
        }
    }
}
