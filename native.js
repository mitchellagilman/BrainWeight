// Brainweight native bridge.
// Does nothing in a normal browser. Inside the iPhone/Android app (Capacitor) it:
//  - schedules a "Rest is over" notification so you get alerted with the phone locked
//  - buzzes the phone when rest ends
//  - sends the current workout to the Apple Watch and takes commands back from it
(function () {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  const P = C.Plugins || {};
  const LN = P.LocalNotifications;
  const H = P.Haptics;
  const W = P.WatchBridge; // iOS only, see app/ios-plugin
  const REST_ID = 4201;
  let allowed = null;
  let pending = null;
  let timer = null;

  async function canNotify() {
    if (!LN) return false;
    if (allowed !== null) return allowed;
    try {
      const r = await LN.requestPermissions();
      allowed = r.display === 'granted';
    } catch (e) {
      allowed = false;
    }
    return allowed;
  }

  function sendToWatch(state) {
    if (!W) return;
    try { W.send({ state: JSON.stringify(state) }); } catch (e) {}
  }

  window.BWNative = {
    async restStart(endTs, label) {
      if (!(await canNotify())) return;
      try {
        await LN.cancel({ notifications: [{ id: REST_ID }] });
        await LN.schedule({
          notifications: [{
            id: REST_ID,
            title: 'Rest is over',
            body: label || 'Time for your next set',
            schedule: { at: new Date(endTs), allowWhileIdle: true },
          }],
        });
      } catch (e) {}
    },
    async restCancel() {
      try { if (LN) await LN.cancel({ notifications: [{ id: REST_ID }] }); } catch (e) {}
    },
    restEnd() {
      try { if (H) H.notification({ type: 'WARNING' }); } catch (e) {}
    },
    // Called on every workout change; batched so the watch gets at most ~2 updates a second.
    sync(state) {
      pending = state;
      if (timer) return;
      timer = setTimeout(() => { timer = null; sendToWatch(pending); }, 400);
    },
  };

  if (W && W.addListener) {
    W.addListener('command', (msg) => {
      const app = window.BWApp;
      if (!app) return;
      if (msg.action === 'complete') app.completeNext();
      else if (msg.action === 'skipRest') app.skipRest();
      else if (msg.action === 'addRest') app.addRest(msg.seconds || 15);
      sendToWatch(app.state());
    });
  }
})();
