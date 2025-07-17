chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getQuote") {
    fetch("https://zenquotes.io/api/random")
      .then(res => res.json())
      .then(data => {
        console.log("Quote data fetched:", data);
        sendResponse({ quote: data });
      })
      .catch(err => {
        console.error("Error fetching quote:", err);
        sendResponse({ error: err.message });
      });
    
    return true; // Keep the message channel open for the async response
  }
});
