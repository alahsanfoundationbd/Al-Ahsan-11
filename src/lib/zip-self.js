// Vite নিজের ফাইলকে glob থেকে বাদ দেয়, তাই zip-export.js-এর কোড এখান থেকে জিপে যায়।
const selfFiles = import.meta.glob("/src/lib/zip-export.js", { query: "?raw", import: "default" });

export default selfFiles;
