/** Prints a labeled stage line plus indented key/value details, for narrating a multi-step flow live. */
export function logStage(stage: string, message: string, details?: Record<string, unknown>) {
  console.log(`\n[${new Date().toISOString()}] [${stage}] ${message}`);
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      console.log(`    ${key}: ${value}`);
    }
  }
}
