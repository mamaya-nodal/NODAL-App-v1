export type DirectIdentityInput = Readonly<{
  email: string;
  fullName: string;
}>;

export type PreparedDirectIdentity = Readonly<{
  email: string;
  firstName: string;
  lastName: string;
}>;

export function prepareDirectIdentity(input: DirectIdentityInput): PreparedDirectIdentity | null {
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const separator = fullName.indexOf(" ");
  if (separator <= 0 || separator === fullName.length - 1 || fullName.length > 200) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return {
    email,
    firstName: fullName.slice(0, separator),
    lastName: fullName.slice(separator + 1),
  };
}
