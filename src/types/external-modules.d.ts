declare module "nodemailer" {
  const nodemailer: {
    createTransport: (config: unknown) => {
      sendMail: (mail: unknown) => Promise<unknown>;
    };
  };
  export default nodemailer;
}

declare module "qrcode" {
  const QRCode: {
    toDataURL: (value: string) => Promise<string>;
  };
  export default QRCode;
}
