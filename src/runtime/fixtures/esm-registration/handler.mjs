globalThis.registrationEvents.push("handler");

export async function handle() {
  return { statusCode: 200 };
}
