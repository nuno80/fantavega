const required = {
  vercel: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "NEXT_PUBLIC_SOCKET_URL", "SOCKET_EMIT_SECRET", "ALLOWED_ORIGINS", "CLERK_SECRET_KEY", "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
  railway: ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "SOCKET_EMIT_SECRET", "ALLOWED_ORIGINS", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"]
};

const target = process.argv[2];
if (!target || !required[target]) {
  console.error("Usage: node scripts/verify-deployment-config.mjs vercel|railway");
  process.exit(2);
}

const missing = required[target].filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`[${target}] Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`[${target}] Required environment variables are present.`);
