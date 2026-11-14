// source-bundle.server.js নিজেকে glob-এ পায় না, তাই তার কোড এখান থেকে জিপে যায়।
const selfFiles = import.meta.glob("/src/lib/source-bundle.server.js", { query: "?raw", import: "default" });

export default selfFiles;
