import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

// The mobile app is a thin native shell around the real TABS web app, so it is
// pixel-for-pixel identical to the website and there's only one UI to maintain.
// The only thing the shell adds is native push: it grabs this device's push
// token and hands it to the web app (which is signed in) to store, so friends'
// reminders can reach the phone.
const SITE_URL = "https://tabsonfriends.com";

// Match the site's dark background so there's no white flash before it loads.
const BG = "#0b0b10";

// Show notifications even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  // Android hardware back button navigates the web history instead of closing.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Ask for permission, get this device's Expo push token, and inject it into
  // the web app so it can save it under the logged-in user's pushTokens.
  const sendPushTokenToWeb = useCallback(async () => {
    try {
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Reminders",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      // projectId comes from EAS (app.json → extra.eas.projectId, added by
      // `eas init`). Without it Expo can't mint a push token.
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      if (!token) return;

      webRef.current?.injectJavaScript(
        `window.__onNativePushToken && window.__onNativePushToken(${JSON.stringify(
          token
        )}, ${JSON.stringify(Platform.OS)}); true;`
      );
    } catch (error) {
      console.warn("Push token registration failed:", error);
    }
  }, []);

  // Messages posted by the web app (window.ReactNativeWebView.postMessage).
  const onMessage = useCallback(
    (event) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "requestPushToken") sendPushTokenToWeb();
      } catch {
        // non-JSON messages are ignored
      }
    },
    [sendPushTokenToWeb]
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <WebView
          ref={webRef}
          source={{ uri: SITE_URL }}
          originWhitelist={["*"]}
          onMessage={onMessage}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
          // Let the site's SMS/tel links and Google auth open normally.
          setSupportMultipleWindows={false}
          javaScriptEnabled
          domStorageEnabled
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          style={{ backgroundColor: BG }}
        />
        {loading && (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color="#50c444" />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
  },
});
