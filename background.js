const NOTIFICATION_ICON =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4b7bff" />
          <stop offset="100%" stop-color="#62b8ff" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="112" height="112" rx="28" fill="url(#bg)" />
      <path d="M40 38h48a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V44a6 6 0 0 1 6-6Z" fill="white" opacity="0.94"/>
      <path d="M46 54h36M46 66h36M46 78h24" stroke="#3568f6" stroke-width="6" stroke-linecap="round"/>
    </svg>
  `);

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
