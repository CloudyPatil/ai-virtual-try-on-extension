import { createApp } from "./app.js";
import { createInferenceProvider } from "./provider-factory.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const app = createApp(createInferenceProvider());

app.listen(port, "127.0.0.1", () => {
  console.log(`Try-on API listening at http://127.0.0.1:${port}`);
});

