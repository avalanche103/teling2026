import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

const EMPLOYEES_PATH = path.join(process.cwd(), "data", "employees.json");
const AUTH_SECRET_PATH = path.join(process.cwd(), "data", "auth-secret.txt");
const SESSION_COOKIE_NAME = "teling_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type StaffRole = "admin" | "employee" | "operator";

export interface EmployeeRecord {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  passwordSalt: string;
  passwordHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: Employee;
  expiresAt: string;
}

interface SessionPayload {
  sub: string;
  exp: number;
}

type EmployeePatch = {
  name?: string;
  username?: string;
  role?: StaffRole;
  active?: boolean;
  password?: string;
};

function getAuthSecret(): string {
  if (process.env.ADMIN_AUTH_SECRET) return process.env.ADMIN_AUTH_SECRET;
  if (existsSync(AUTH_SECRET_PATH)) {
    return readFileSync(AUTH_SECRET_PATH, "utf-8").trim();
  }

  const secret = randomBytes(32).toString("hex");
  writeFileSync(AUTH_SECRET_PATH, `${secret}\n`, "utf-8");
  return secret;
}

function toEmployee(record: EmployeeRecord): Employee {
  return {
    id: record.id,
    username: record.username,
    name: record.name,
    role: record.role,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeRole(input: unknown): StaffRole {
  return input === "admin" || input === "employee" || input === "operator"
    ? input
    : "operator";
}

function readEmployees(): EmployeeRecord[] {
  try {
    const raw = JSON.parse(readFileSync(EMPLOYEES_PATH, "utf-8")) as Partial<EmployeeRecord>[];
    return raw
      .filter((item): item is Partial<EmployeeRecord> & { id: string; username: string } => {
        return Boolean(item?.id && item?.username);
      })
      .map((item) => ({
        id: item.id!,
        username: String(item.username).trim().toLowerCase(),
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : String(item.username),
        role: normalizeRole(item.role),
        passwordSalt: typeof item.passwordSalt === "string" ? item.passwordSalt : "",
        passwordHash: typeof item.passwordHash === "string" ? item.passwordHash : "",
        active: item.active !== false,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function writeEmployees(employees: EmployeeRecord[]): void {
  writeFileSync(EMPLOYEES_PATH, JSON.stringify(employees, null, 2), "utf-8");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function signPayload(payloadBase64: string): string {
  return createHmac("sha256", getAuthSecret()).update(payloadBase64).digest("base64url");
}

function createSessionToken(userId: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  const payload: SessionPayload = {
    sub: userId,
    exp: expiresAt.getTime(),
  };
  const payloadBase64 = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return {
    token: `${payloadBase64}.${signature}`,
    expiresAt,
  };
}

function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = signPayload(payloadBase64);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(payloadBase64)) as Partial<SessionPayload>;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

export function listEmployees(): Employee[] {
  return readEmployees().map(toEmployee);
}

export function authenticateEmployee(username: string, password: string): Employee | null {
  const normalizedUsername = username.trim().toLowerCase();
  const employee = readEmployees().find((item) => item.username === normalizedUsername && item.active);
  if (!employee || !employee.passwordSalt || !employee.passwordHash) return null;

  const derivedHash = scryptSync(password, employee.passwordSalt, 64);
  const storedHash = Buffer.from(employee.passwordHash, "hex");

  if (derivedHash.length !== storedHash.length || !timingSafeEqual(derivedHash, storedHash)) {
    return null;
  }

  return toEmployee(employee);
}

export function createEmployee(input: {
  username: string;
  name: string;
  role: StaffRole;
  password: string;
}): Employee {
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  if (!username || !name || !input.password.trim()) {
    throw new Error("Имя, логин и пароль обязательны");
  }

  const employees = readEmployees();
  if (employees.some((item) => item.username === username)) {
    throw new Error("Сотрудник с таким логином уже существует");
  }

  const { salt, hash } = hashPassword(input.password.trim());
  const now = new Date().toISOString();
  const employee: EmployeeRecord = {
    id: randomBytes(12).toString("hex"),
    username,
    name,
    role: input.role,
    passwordSalt: salt,
    passwordHash: hash,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  employees.push(employee);
  writeEmployees(employees);
  return toEmployee(employee);
}

export function updateEmployee(id: string, patch: EmployeePatch): Employee {
  const employees = readEmployees();
  const index = employees.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Сотрудник не найден");

  const current = employees[index];
  const nextUsername = patch.username !== undefined ? patch.username.trim().toLowerCase() : current.username;
  const nextName = patch.name !== undefined ? patch.name.trim() : current.name;
  const nextRole = patch.role ?? current.role;
  const nextActive = patch.active ?? current.active;

  if (!nextUsername || !nextName) {
    throw new Error("Имя и логин обязательны");
  }

  if (employees.some((item) => item.id !== id && item.username === nextUsername)) {
    throw new Error("Сотрудник с таким логином уже существует");
  }

  const adminCount = employees.filter((item) => item.role === "admin" && item.active).length;
  if (current.role === "admin" && current.active && ((!nextActive) || nextRole !== "admin") && adminCount <= 1) {
    throw new Error("Нельзя убрать последнего администратора");
  }

  const password = patch.password?.trim();
  const passwordFields = password ? hashPassword(password) : null;

  const nextRecord: EmployeeRecord = {
    ...current,
    username: nextUsername,
    name: nextName,
    role: nextRole,
    active: nextActive,
    passwordSalt: passwordFields?.salt ?? current.passwordSalt,
    passwordHash: passwordFields?.hash ?? current.passwordHash,
    updatedAt: new Date().toISOString(),
  };

  employees[index] = nextRecord;
  writeEmployees(employees);
  return toEmployee(nextRecord);
}

export function getDefaultAdminPath(role: StaffRole): string {
  if (role === "operator") return "/admin/chat";
  return "/admin";
}

export function canAccessRole(role: StaffRole, allowedRoles: StaffRole[]): boolean {
  return allowedRoles.includes(role);
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const payload = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!payload) return null;

  const record = readEmployees().find((item) => item.id === payload.sub && item.active);
  if (!record) return null;

  return {
    user: toEmployee(record),
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export async function requireSession(allowedRoles?: StaffRole[]): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (allowedRoles && !canAccessRole(session.user.role, allowedRoles)) {
    redirect(getDefaultAdminPath(session.user.role));
  }
  return session;
}

export async function requireApiSession(allowedRoles?: StaffRole[]) {
  const session = await getSession();
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (allowedRoles && !canAccessRole(session.user.role, allowedRoles)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, session };
}

export function createSessionResponse(user: Employee): NextResponse {
  const { token, expiresAt } = createSessionToken(user.id);
  const response = NextResponse.json({ user });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export function createLogoutResponse(): NextResponse {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}