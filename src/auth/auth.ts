import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin as betterAuthAdmin, bearer, jwt } from "better-auth/plugins";
import { env } from "../config/env.js";
import { getDatabase, mongoClient } from "../config/database.js";

const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : undefined;

export const auth = betterAuth({
  appName: "MediCare Connect",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CLIENT_URL],
  database: mongodbAdapter(getDatabase(), { client: mongoClient }),
  emailAndPassword: { enabled: true },
  ...(socialProviders ? { socialProviders } : {}),
  plugins: [
    betterAuthAdmin(),
    bearer({ requireSignature: true }),
    jwt({
      jwt: {
        issuer: env.BETTER_AUTH_URL,
        audience: env.BETTER_AUTH_URL,
        expirationTime: "15m",
      },
      jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
    }),
  ],
});
