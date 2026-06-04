function installMapUpsertMethods(): void {
  if (typeof Map === 'undefined') return

  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown
    getOrInsertComputed?: (key: unknown, callbackFn: (key: unknown) => unknown) => unknown
  }

  // PDF.js v5.5+ uses these ES2027 Map methods; not yet in all Chromium builds.
  if (typeof proto.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      value(key: unknown, defaultValue: unknown): unknown {
        if (!this.has(key)) this.set(key, defaultValue)
        return this.get(key)
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      value(key: unknown, callbackFn: (key: unknown) => unknown): unknown {
        if (!this.has(key)) this.set(key, callbackFn(key))
        return this.get(key)
      },
      writable: true,
      configurable: true,
    })
  }
}

type Uint8ArrayCtorWithCodecs = typeof Uint8Array & {
  fromHex?: (hex: string) => Uint8Array
  fromBase64?: (str: string) => Uint8Array
}

type Uint8ArrayWithCodecs = Uint8Array & {
  toHex?: () => string
  toBase64?: () => string
}

function installUint8ArrayCodecs(): void {
  if (typeof Uint8Array === 'undefined') return

  const ctor = Uint8Array as Uint8ArrayCtorWithCodecs
  const proto = Uint8Array.prototype as Uint8ArrayWithCodecs

  if (typeof proto.toHex !== 'function') {
    Object.defineProperty(proto, 'toHex', {
      value(this: Uint8Array): string {
        let out = ''
        for (let i = 0; i < this.length; i++) {
          out += (this[i] as number).toString(16).padStart(2, '0')
        }
        return out
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof ctor.fromHex !== 'function') {
    Object.defineProperty(ctor, 'fromHex', {
      value(hex: string): Uint8Array {
        const clean = hex.length % 2 === 0 ? hex : hex.slice(0, -1)
        const out = new Uint8Array(clean.length / 2)
        for (let i = 0; i < out.length; i++) {
          out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
        }
        return out
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof proto.toBase64 !== 'function') {
    Object.defineProperty(proto, 'toBase64', {
      value(this: Uint8Array): string {
        let binary = ''
        for (let i = 0; i < this.length; i++) binary += String.fromCharCode(this[i] as number)
        if (typeof btoa === 'function') return btoa(binary)
        return Buffer.from(binary, 'binary').toString('base64')
      },
      writable: true,
      configurable: true,
    })
  }

  if (typeof ctor.fromBase64 !== 'function') {
    Object.defineProperty(ctor, 'fromBase64', {
      value(str: string): Uint8Array {
        const binary =
          typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary')
        const out = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
        return out
      },
      writable: true,
      configurable: true,
    })
  }
}

installMapUpsertMethods()
installUint8ArrayCodecs()

export {}
