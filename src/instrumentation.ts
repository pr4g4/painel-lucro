/** Registrado pelo Next na subida do servidor (só runtime Node): rejeição não tratada vira log, não queda. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./instrumentation-node");
}
