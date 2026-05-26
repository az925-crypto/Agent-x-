export interface OsintTarget {
  type: 'ip' | 'domain' | 'username' | 'email';
  value: string;
}

export interface OsintReport {
  target: OsintTarget;
  narrative: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  findings: string[];
}
