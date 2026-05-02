// QR code generation wrapper - static import for CommonJS compatibility
import QRCode from 'qrcode';

export async function generateQRCode(text: string, options?: QRCode.QRCodeToDataURLOptions): Promise<string> {
  return await QRCode.toDataURL(text, {
    width: 300,
    margin: 2,
    ...options,
  });
}

export async function generateQRCodeCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCode.QRCodeRenderersOptions): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: 300,
    margin: 2,
    ...options
  });
}
