const UNIT_CODE = /^[A-Z]{2}$/;
const DESK_CODE = /^(?:MP|M[0-9]{2,})$/;

export function formatNodalUserIdentifier(
  unitCode: string,
  deskCode: string,
  memberNumber: number,
) {
  const normalizedUnit = unitCode.trim().toUpperCase();
  const normalizedDesk = deskCode.trim().toUpperCase();
  if (!UNIT_CODE.test(normalizedUnit)) throw new Error("INVALID_UNIT_CODE");
  if (!DESK_CODE.test(normalizedDesk)) throw new Error("INVALID_DESK_CODE");
  if (!Number.isSafeInteger(memberNumber) || memberNumber < 1) {
    throw new Error("INVALID_MEMBER_NUMBER");
  }
  return `USER${normalizedUnit}-${normalizedDesk}-${String(memberNumber).padStart(2, "0")}`;
}
