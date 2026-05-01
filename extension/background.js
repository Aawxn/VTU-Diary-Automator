const NOTIFICATION_ICON = chrome.runtime.getURL("icons/icon-128.png");

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "VTU_NOTIFY") {
    return;
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: NOTIFICATION_ICON,
    title: message.title || "VTU Automator",
    message: message.message || "Automation completed."
  });
});
