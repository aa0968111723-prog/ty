// @ts-nocheck -- Thin wrapper around @simplewebauthn/server.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64url(value) {
  return Buffer.from(String(value || ""), "base64url");
}

export async function registrationOptions(input) {
  return generateRegistrationOptions({
    rpName: input.rpName,
    rpID: input.rpID,
    userName: input.userName,
    userID: new TextEncoder().encode(String(input.userID)),
    userDisplayName: input.userDisplayName || input.userName,
    attestationType: "none",
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    excludeCredentials: (input.excludeCredentials || []).map((row) => ({
      id: row.id,
      transports: row.transports,
    })),
  });
}

export async function verifyRegistration(input) {
  const result = await verifyRegistrationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
    expectedRPID: input.expectedRPID,
    requireUserVerification: true,
  });
  if (!result.verified || !result.registrationInfo) throw new Error("unverified");
  const credential = result.registrationInfo.credential;
  return {
    credentialId: credential.id,
    publicKey: b64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || [],
  };
}

export async function authenticationOptions(input) {
  return generateAuthenticationOptions({
    rpID: input.rpID,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: (input.allowCredentials || []).map((row) => ({
      id: row.id,
      transports: row.transports,
    })),
  });
}

export async function verifyAuthentication(input) {
  const credential = input.credential;
  const result = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: input.expectedChallenge,
    expectedOrigin: input.expectedOrigin,
    expectedRPID: input.expectedRPID,
    requireUserVerification: true,
    credential: {
      id: credential.credentialId,
      publicKey: fromB64url(credential.publicKey),
      counter: Number(credential.counter || 0),
      transports: credential.transports,
    },
  });
  if (!result.verified) throw new Error("unverified");
  return { newCounter: result.authenticationInfo.newCounter };
}
