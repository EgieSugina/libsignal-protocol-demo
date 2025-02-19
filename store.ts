/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  StorageType,
  Direction,
  SessionRecordType,
  SignalProtocolAddress,
  PreKeyPairType,
  SignedPreKeyPairType,
} from "@privacyresearch/libsignal-protocol-typescript";

// Define interfaces first for better organization
interface KeyPairType {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
}

interface PreKeyType {
  keyId: number;
  keyPair: KeyPairType;
}

interface SignedPreKeyType extends PreKeyType {
  signature: ArrayBuffer;
}

// Type guards with more specific error messages
export function isKeyPairType(kp: unknown): kp is KeyPairType {
  if (!kp || typeof kp !== "object") return false;
  const pair = kp as KeyPairType;
  return isArrayBuffer(pair.privKey) && isArrayBuffer(pair.pubKey);
}

export function isPreKeyType(pk: unknown): pk is PreKeyPairType {
  if (!pk || typeof pk !== "object") return false;
  const preKey = pk as PreKeyType;
  return typeof preKey.keyId === "number" && isKeyPairType(preKey.keyPair);
}

export function isSignedPreKeyType(spk: unknown): spk is SignedPreKeyPairType {
  if (!spk || typeof spk !== "object") return false;
  const signedKey = spk as SignedPreKeyType;
  return isArrayBuffer(signedKey.signature) && isPreKeyType(signedKey);
}

type StoreValue =
  | KeyPairType
  | string
  | number
  | PreKeyType
  | SignedPreKeyType
  | ArrayBuffer
  | undefined;

function isArrayBuffer(thing: unknown): thing is ArrayBuffer {
  return (
    !!thing &&
    typeof thing === "object" &&
    "byteLength" in thing &&
    thing instanceof ArrayBuffer
  );
}

const STORE_PREFIX = {
  PREKEY: "Sylens-KeypreKey",
  SIGNED_KEY: "Sylens-KeysignedKey",
  IDENTITY: "identityKey",
  SESSION: "session",
} as const;

export class SignalProtocolStore implements StorageType {
  private _store: Map<string, StoreValue>;

  constructor() {
    this._store = new Map();
  }

  private validateKey(key: string): void {
    if (key == null) {
      throw new Error("Key cannot be null or undefined");
    }
  }

  private validateKeyValue(key: string, value: StoreValue): void {
    if (key == null || value == null) {
      throw new Error("Key and value cannot be null or undefined");
    }
  }

  get(key: string, defaultValue: StoreValue): StoreValue {
    this.validateKey(key);
    return this._store.has(key) ? this._store.get(key) : defaultValue;
  }

  remove(key: string): void {
    this.validateKey(key);
    this._store.delete(key);
  }

  put(key: string, value: StoreValue): void {
    this.validateKeyValue(key, value);
    this._store.set(key, value);
  }

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const kp = this.get(STORE_PREFIX.IDENTITY, undefined);

    if (!kp) return undefined;
    if (isKeyPairType(kp)) return kp;
    throw new Error("Stored identity key has invalid format");
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const rid = this.get("registrationId", undefined);
    if (typeof rid === "number" || typeof rid === "undefined") return rid;
    throw new Error("Stored registration ID is not a number");
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    this.remove(STORE_PREFIX.IDENTITY + identifier);
    this.validateKey(identifier);
    const trusted = this.get(STORE_PREFIX.IDENTITY + identifier, undefined);
    if (!trusted) return true;
    if (!isArrayBuffer(trusted)) {
      throw new Error(
        `Stored identity key has invalid format ${trusted} | ${identifier}`
      );
    }

    return arrayBufferToString(identityKey) === arrayBufferToString(trusted);
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const res = this.get(`${STORE_PREFIX.PREKEY}${keyId}`, undefined);
    if (!res) return undefined;
    if (isKeyPairType(res)) return res;
    throw new Error("Stored pre-key has invalid format");
  }

  async loadSession(
    identifier: string
  ): Promise<SessionRecordType | undefined> {
    const rec = this.get(`${STORE_PREFIX.SESSION}${identifier}`, undefined);
    if (typeof rec === "string" || typeof rec === "undefined") return rec;
    throw new Error("Session record must be a string");
  }

  async loadSignedPreKey(
    keyId: number | string
  ): Promise<KeyPairType | undefined> {
    const res = this.get(`${STORE_PREFIX.SIGNED_KEY}${keyId}`, undefined);
    if (!res) return undefined;
    if (isKeyPairType(res)) return res;
    throw new Error("Stored signed pre-key has invalid format");
  }

  async removePreKey(keyId: number | string): Promise<void> {
    this.remove(`${STORE_PREFIX.PREKEY}${keyId}`);
  }

  async saveIdentity(
    identifier: string,
    identityKey: ArrayBuffer
  ): Promise<boolean> {
    this.validateKeyValue(identifier, identityKey);

    const address = SignalProtocolAddress.fromString(identifier);
    console.log("address", address);

    const existing = this.get(
      `${STORE_PREFIX.IDENTITY}${address.getName()}`,
      undefined
    );

    if (existing && !isArrayBuffer(existing)) {
      throw new Error("Existing identity key has invalid format");
    }

    this.put(`${STORE_PREFIX.IDENTITY}${address.getName()}`, identityKey);

    return !!(
      existing &&
      arrayBufferToString(identityKey) !==
        arrayBufferToString(existing as ArrayBuffer)
    );
  }

  async storeSession(
    identifier: string,
    record: SessionRecordType
  ): Promise<void> {
    this.put(`${STORE_PREFIX.SESSION}${identifier}`, record);
  }

  async loadIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
    this.validateKey(identifier);
    const key = this.get(`${STORE_PREFIX.IDENTITY}${identifier}`, undefined);

    if (!key) return undefined;
    if (isArrayBuffer(key)) return key;
    throw new Error("Stored identity key has invalid format");
  }

  async storePreKey(
    keyId: number | string,
    keyPair: KeyPairType
  ): Promise<void> {
    this.put(`${STORE_PREFIX.PREKEY}${keyId}`, keyPair);
  }

  async storeSignedPreKey(
    keyId: number | string,
    keyPair: KeyPairType
  ): Promise<void> {
    this.put(`${STORE_PREFIX.SIGNED_KEY}${keyId}`, keyPair);
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    this.remove(`${STORE_PREFIX.SIGNED_KEY}${keyId}`);
  }

  async removeSession(identifier: string): Promise<void> {
    this.remove(`${STORE_PREFIX.SESSION}${identifier}`);
  }

  async removeAllSessions(identifier: string): Promise<void> {
    const sessionPrefix = `${STORE_PREFIX.SESSION}${identifier}`;
    for (const [key] of this._store) {
      if (key.startsWith(sessionPrefix)) {
        this._store.delete(key);
      }
    }
  }
}

export function arrayBufferToString(b: ArrayBuffer): string {
  return uint8ArrayToString(new Uint8Array(b));
}

export function uint8ArrayToString(arr: Uint8Array): string {
  if (arr.length === 0) return "";

  const chunkSize = 1024;
  const parts: string[] = [];

  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.slice(i, i + chunkSize);
    parts.push(String.fromCharCode(...chunk));
  }

  return parts.join("");
}
