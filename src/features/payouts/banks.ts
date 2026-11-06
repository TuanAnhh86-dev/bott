export interface SupportedBank {
  code: string;
  shortName: string;
  name: string;
  bin: string;
  isPopular?: boolean;
}

export const VIETNAMESE_BANKS: SupportedBank[] = [
  { code: "MB", shortName: "MBBank", name: "Ngân hàng TMCP Quân Đội", bin: "970422", isPopular: true },
  { code: "VCB", shortName: "Vietcombank", name: "Ngân hàng TMCP Ngoại Thương Việt Nam", bin: "970436", isPopular: true },
  { code: "TCB", shortName: "Techcombank", name: "Ngân hàng TMCP Kỹ Thương Việt Nam", bin: "970407", isPopular: true },
  { code: "VPB", shortName: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng", bin: "970432", isPopular: true },
  { code: "ACB", shortName: "ACB", name: "Ngân hàng TMCP Á Châu", bin: "970416", isPopular: true },
  { code: "BIDV", shortName: "BIDV", name: "Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam", bin: "970418", isPopular: true },
  { code: "CTG", shortName: "VietinBank", name: "Ngân hàng TMCP Công Thương Việt Nam", bin: "970415", isPopular: true },
  { code: "TPB", shortName: "TPBank", name: "Ngân hàng TMCP Tiên Phong", bin: "970423", isPopular: true },
  { code: "STB", shortName: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín", bin: "970403" },
  { code: "HDB", shortName: "HDBank", name: "Ngân hàng TMCP Phát Triển TP.HCM", bin: "970437" },
  { code: "VIB", shortName: "VIB", name: "Ngân hàng TMCP Quốc Tế Việt Nam", bin: "970441" },
  { code: "MSB", shortName: "MSB", name: "Ngân hàng TMCP Hàng Hải Việt Nam", bin: "970426" },
  { code: "SHB", shortName: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội", bin: "970443" },
  { code: "OCB", shortName: "OCB", name: "Ngân hàng TMCP Phương Đông", bin: "970448" },
  { code: "SEAB", shortName: "SeABank", name: "Ngân hàng TMCP Đông Nam Á", bin: "970440" },
  { code: "MOMO", shortName: "Momo", name: "Ví điện tử MoMo", bin: "MOMO" },
  { code: "ZALOPAY", shortName: "ZaloPay", name: "Ví điện tử ZaloPay", bin: "ZALOPAY" },
];

export function findBankInfo(providerName: string): SupportedBank {
  const norm = (providerName || "").toUpperCase().replace(/\s+/g, "");
  const found = VIETNAMESE_BANKS.find(
    (b) =>
      norm.includes(b.code) ||
      norm.includes(b.shortName.toUpperCase()) ||
      b.shortName.toUpperCase().includes(norm)
  );
  return found || {
    code: "CUSTOM",
    shortName: providerName || "Ngân hàng thụ hưởng",
    name: providerName || "Ngân hàng liên kết",
    bin: "970499",
  };
}

