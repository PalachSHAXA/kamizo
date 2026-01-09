// QR code generation wrapper - static import for CommonJS compatibility
// @ts-nocheck
import QRCode from 'qrcode';

export async function generateQRCode(text: string, options?: any): Promise<string> {
  return await QRCode.toDataURL(text, {
    width: 300,
    margin: 2,
    ...options
  });
}

export async function generateQRCodeCanvas(canvas: HTMLCanvasElement, text: string, options?: any): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: 300,
    margin: 2,
    ...options
  });
}
