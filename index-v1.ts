import {
    KeyHelper,
    SessionCipher,
    SessionBuilder,
    SignalProtocolAddress,
    KeyPairType,
  } from "@privacyresearch/libsignal-protocol-typescript";
  import { SignalProtocolStore } from "./store";
  
  export interface PreKeyBundle {
    identityKeyPair: KeyPairType;
    registrationId: number;
    preKey: {
      keyId: number;
      keyPair: KeyPairType;
    };
    signedPreKey: {
      keyId: number;
      keyPair: KeyPairType;
      signature: ArrayBuffer;
    };
  }
  
  export class SignalProtocolManager {
    private store: SignalProtocolStore;
  
    constructor() {
      this.store = new SignalProtocolStore();
    }
  
    /**
     * Generates a new pre-key bundle (identity key, registration id, pre-key, signed pre-key)
     */
    public async generatePreKeyBundle(): Promise<PreKeyBundle> {
      // Generate our identity key pair and registration ID.
      const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
      const registrationId = await KeyHelper.generateRegistrationId();
  
      // Generate a random pre-key.
      const preKeyId = Math.floor(Math.random() * 1000000);
      const preKey = await KeyHelper.generatePreKey(preKeyId);
  
      // Generate a random signed pre-key.
      const signedPreKeyId = Math.floor(Math.random() * 1000000);
      const signedPreKey = await KeyHelper.generateSignedPreKey(
        identityKeyPair,
        signedPreKeyId
      );
  
      return {
        identityKeyPair,
        registrationId,
        preKey: {
          keyId: preKey.keyId,
          keyPair: preKey.keyPair,
        },
        signedPreKey: {
          keyId: signedPreKey.keyId,
          keyPair: signedPreKey.keyPair,
          signature: signedPreKey.signature,
        },
      };
    }
  
    /**
     * Initializes our local store with our keys.
     */
    public async initializeStore(ourBundle: PreKeyBundle): Promise<void> {
      // Store our identity key.
      await this.store.put("identityKey", {
        pubKey: ourBundle.identityKeyPair.pubKey,
        privKey: ourBundle.identityKeyPair.privKey,
      });
      // Store our registration ID.
      await this.store.put("registrationId", ourBundle.registrationId);
      // Store our pre-key.
      await this.store.storePreKey(ourBundle.preKey.keyId, {
        pubKey: ourBundle.preKey.keyPair.pubKey,
        privKey: ourBundle.preKey.keyPair.privKey,
      });
      // Store our signed pre-key.
      await this.store.storeSignedPreKey(ourBundle.signedPreKey.keyId, {
        pubKey: ourBundle.signedPreKey.keyPair.pubKey,
        privKey: ourBundle.signedPreKey.keyPair.privKey,
      });
    }
  
    /**
     * Creates a session with a remote user given our and their pre-key bundles.
     * @param userId Identifier for the remote user.
     * @param ourBundle Our own pre-key bundle.
     * @param theirBundle The remote user's pre-key bundle.
     */
    public async createSession(
      userId: string,
      ourBundle: PreKeyBundle,
      theirBundle: PreKeyBundle
    ): Promise<SessionCipher> {
      // Ensure our local store is initialized.
      await this.initializeStore(ourBundle);
  
      // Save the remote user's identity into our store.
      const theirAddress = new SignalProtocolAddress(userId, 1);
      await this.store.saveIdentity(
        theirAddress.toString(),
        theirBundle.identityKeyPair.pubKey
      );
  
      // Create a session builder and process their pre-key bundle.
      const sessionBuilder = new SessionBuilder(this.store, theirAddress);
      await sessionBuilder.processPreKey({
        registrationId: theirBundle.registrationId,
        identityKey: theirBundle.identityKeyPair.pubKey,
        preKey: {
          keyId: theirBundle.preKey.keyId,
          publicKey: theirBundle.preKey.keyPair.pubKey,
        },
        signedPreKey: {
          keyId: theirBundle.signedPreKey.keyId,
          publicKey: theirBundle.signedPreKey.keyPair.pubKey,
          signature: theirBundle.signedPreKey.signature,
        },
      });
  
      // Return a SessionCipher instance to encrypt/decrypt messages.
      return new SessionCipher(this.store, theirAddress);
    }
  
    /**
     * Encrypts a message using the provided session.
     */
    public async encodeMessage(
      session: SessionCipher,
      message: string
    ): Promise<any> {
      try {
        // Convert the message to an ArrayBuffer.
        const encodedMessage = new TextEncoder().encode(message).buffer;
        return await session.encrypt(encodedMessage);
      } catch (error) {
        console.error("Error encoding message:", error);
        throw error;
      }
    }
  
    /**
     * Decrypts a received message using the provided session.
     */
    public async decodeMessage(
      session: SessionCipher,
      message: { type: number; body: ArrayBuffer }
    ): Promise<string> {
      try {
        let plaintext: ArrayBuffer;
        if (message.type === 3) {
          plaintext = await session.decryptPreKeyWhisperMessage(
            message.body,
            "binary"
          );
        } else if (message.type === 1) {
          plaintext = await session.decryptWhisperMessage(message.body, "binary");
        } else {
          throw new Error(`Unknown message type: ${message.type}`);
        }
        return new TextDecoder().decode(new Uint8Array(plaintext));
      } catch (error) {
        console.error("Error decoding message:", error);
        throw error;
      }
    }
  }
  
  
  
  
  export async function initDemo() {
    try {
      console.log("Generating key bundles...");
      const aliceManager = new SignalProtocolManager();
      const bobManager = new SignalProtocolManager();
  
      const aliceBundle = await aliceManager.generatePreKeyBundle();
      const bobBundle = await bobManager.generatePreKeyBundle();
  
      console.log("Creating sessions...");
      // Alice creates a session to communicate with Bob.
      const aliceSession = await aliceManager.createSession(
        "bob",
        aliceBundle,
        bobBundle
      );
      // Bob creates a session to communicate with Alice.
      const bobSession = await bobManager.createSession(
        "alice",
        bobBundle,
        aliceBundle
      );
  
      console.log("Testing message exchange...");
      const message = "Hello, Signal Protocol!";
      console.log("Original message:", message);
  
      console.log("Encrypting message from Alice to Bob...");
      const encrypted = await aliceManager.encodeMessage(aliceSession, message);
      console.log("Encrypted message:", encrypted);
  
      console.log("Decrypting message at Bob's end...");
      const decrypted = await bobManager.decodeMessage(bobSession, encrypted);
      console.log("Decrypted message:", decrypted);
  
      if (message === decrypted) {
        console.log("Success! Message exchange working correctly.");
      }
    } catch (error) {
      console.error("Initialization error:", error);
    }
  }
  
  initDemo();