/**
 * 金额工具：全项目金额一律以整数「分」存储与运算，仅展示时转为「元」。
 * 转换必须用字符串解析，禁止浮点乘法（如 0.1 * 100 = 10.000000000000002 会出错）。
 */

/** 元字符串（如 "12.34"）→ 分（整数 1234）。格式不合法时抛出异常。 */
export function yuanToCents(input: string): number {
  const s = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error("金额格式不正确，请输入最多两位小数的数字");
  }
  const [intPart, decPart = ""] = s.split(".");
  return Number(intPart) * 100 + Number((decPart + "00").slice(0, 2));
}

/** 分（整数）→ 元字符串（恒两位小数，用于展示） */
export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}
