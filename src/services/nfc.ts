import NfcManager, { NfcTech, Ndef, NfcEvents, TagEvent } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

export interface NFCReadResult {
  success: boolean;
  type?: 'uri' | 'text' | 'external' | 'unknown';
  payload?: string;
  error?: string;
  tagId?: string;
}

export interface NFCWriteData {
  badgeUrl: string;
  attendToken: string;
}

class NFCService {
  private isInitialized = false;
  private isSupported = false;

  async init(): Promise<boolean> {
    if (this.isInitialized) {
      return this.isSupported;
    }

    try {
      this.isSupported = await NfcManager.isSupported();
      if (this.isSupported) {
        await NfcManager.start();
      }
      this.isInitialized = true;
      return this.isSupported;
    } catch (error) {
      console.error('[NFC] Init error:', error);
      this.isInitialized = true;
      this.isSupported = false;
      return false;
    }
  }

  async isEnabled(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      return await NfcManager.isEnabled();
    } catch {
      return false;
    }
  }

  async readTag(): Promise<NFCReadResult> {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your device near the NFC tag',
      });

      const tag = await NfcManager.getTag();
      if (!tag) {
        return { success: false, error: 'No tag found' };
      }

      const tagId = tag.id;
      const ndefRecords = tag.ndefMessage;

      if (!ndefRecords || ndefRecords.length === 0) {
        return { success: false, error: 'No NDEF data on tag', tagId };
      }

      // First pass: look for hackclub.com:attend external record (priority)
      for (const record of ndefRecords) {
        const tnf = record.tnf;
        const type = record.type;
        const payload = record.payload;

        if (!payload || payload.length === 0) continue;

        const typeBytes = Array.isArray(type) ? type : [];
        const payloadBytes = Array.isArray(payload) ? payload : [];

        // External type record (TNF 0x04) - for hackclub.com:attend token
        if (tnf === 0x04) {
          const typeStr = this.bytesToString(typeBytes);
          if (typeStr === 'hackclub.com:attend') {
            const token = this.bytesToString(payloadBytes);
            return { success: true, type: 'external', payload: token, tagId };
          }
        }
      }

      // Second pass: fall back to URI or text records
      for (const record of ndefRecords) {
        const tnf = record.tnf;
        const type = record.type;
        const payload = record.payload;

        if (!payload || payload.length === 0) continue;

        const typeBytes = Array.isArray(type) ? type : [];
        const payloadBytes = Array.isArray(payload) ? payload : [];

        // URI record (TNF 0x01, Type 'U')
        if (tnf === 0x01 && typeBytes.length > 0 && this.bytesToString(typeBytes) === 'U') {
          const uri = this.decodeUriPayload(payloadBytes);
          return { success: true, type: 'uri', payload: uri, tagId };
        }

        // Text record (TNF 0x01, Type 'T')
        if (tnf === 0x01 && typeBytes.length > 0 && this.bytesToString(typeBytes) === 'T') {
          const text = this.decodeTextPayload(payloadBytes);
          return { success: true, type: 'text', payload: text, tagId };
        }
      }

      // Try to find any readable payload
      const firstRecord = ndefRecords[0];
      if (firstRecord.payload) {
        return {
          success: true,
          type: 'unknown',
          payload: this.bytesToString(firstRecord.payload),
          tagId,
        };
      }

      return { success: false, error: 'Could not parse NDEF data', tagId };
    } catch (error: any) {
      const errorMessage = error?.message || 'NFC read failed';
      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        return { success: false, error: 'Cancelled' };
      }
      return { success: false, error: errorMessage };
    } finally {
      await this.cleanup();
    }
  }

  async writeTag(data: NFCWriteData): Promise<{ success: boolean; error?: string }> {
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef, {
        alertMessage: 'Hold your device near the NFC tag to write',
      });

      const uriRecord = Ndef.uriRecord(data.badgeUrl);
      const externalRecord = Ndef.record(
        Ndef.TNF_EXTERNAL_TYPE,
        'hackclub.com:attend',
        [],
        this.stringToBytes(data.attendToken)
      );

      const bytes = Ndef.encodeMessage([uriRecord, externalRecord]);
      await NfcManager.ndefHandler.writeNdefMessage(bytes);

      return { success: true };
    } catch (error: any) {
      const errorMessage = error?.message || 'NFC write failed';
      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        return { success: false, error: 'Cancelled' };
      }
      return { success: false, error: errorMessage };
    } finally {
      await this.cleanup();
    }
  }

  async cancelOperation(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cancel errors
    }
  }

  private async cleanup(): Promise<void> {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cleanup errors
    }
  }

  private decodeUriPayload(payload: number[]): string {
    const prefixByte = payload[0];
    const uriBody = this.bytesToString(payload.slice(1));
    const prefixes: { [key: number]: string } = {
      0x00: '',
      0x01: 'http://www.',
      0x02: 'https://www.',
      0x03: 'http://',
      0x04: 'https://',
      0x05: 'tel:',
      0x06: 'mailto:',
    };
    const prefix = prefixes[prefixByte] || '';
    return prefix + uriBody;
  }

  private decodeTextPayload(payload: number[]): string {
    const statusByte = payload[0];
    const langCodeLen = statusByte & 0x3f;
    return this.bytesToString(payload.slice(1 + langCodeLen));
  }

  private bytesToString(bytes: number[]): string {
    return bytes.map(b => String.fromCharCode(b)).join('');
  }

  private stringToBytes(str: string): number[] {
    return str.split('').map(c => c.charCodeAt(0));
  }
}

export const nfcService = new NFCService();
