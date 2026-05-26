import { test, expect } from 'vitest';
import { validateTarget, isValidIP, resolveTargetData, GeoJSResponse } from './src/utils';

test('Target validation logic', () => {
    // Valid target (UPPERCASE)
    expect(validateTarget({ type: 'DOMAIN', value: 'example.com' })).toBe(true);
    expect(validateTarget({ type: 'IP', value: '8.8.8.8' })).toBe(true);
    expect(validateTarget({ type: 'EMAIL', value: 'user@example.com' })).toBe(true);
    expect(validateTarget({ type: 'USERNAME', value: 'johndoe' })).toBe(true);

    // Valid target (lowercase — matches frontend)
    expect(validateTarget({ type: 'domain', value: 'example.com' })).toBe(true);
    expect(validateTarget({ type: 'ip', value: '8.8.8.8' })).toBe(true);
    expect(validateTarget({ type: 'email', value: 'user@example.com' })).toBe(true);
    expect(validateTarget({ type: 'username', value: 'johndoe' })).toBe(true);

    // Invalid type value
    expect(validateTarget({ type: 'INVALID', value: 'test' })).toBe(false);

    // Invalid targets
    expect(validateTarget(null)).toBe(false);
    expect(validateTarget(undefined)).toBe(false);
    expect(validateTarget({})).toBe(false);
    expect(validateTarget({ type: 'DOMAIN' })).toBe(false);
    expect(validateTarget({ value: 'example.com' })).toBe(false);
    expect(validateTarget({ type: 'DOMAIN', value: '' })).toBe(false);
    expect(validateTarget({ type: 'DOMAIN', value: '   ' })).toBe(false);
});

test('isValidIP function', () => {
    expect(isValidIP('8.8.8.8')).toBe(true);
    expect(isValidIP('192.168.1.1')).toBe(true);
    expect(isValidIP('0.0.0.0')).toBe(true);
    expect(isValidIP('255.255.255.255')).toBe(true);
    expect(isValidIP('999.999.999.999')).toBe(false);
    expect(isValidIP('256.1.2.3')).toBe(false);
    expect(isValidIP('')).toBe(false);
    expect(isValidIP('not-an-ip')).toBe(false);
    expect(isValidIP('1.2.3')).toBe(false);
    expect(isValidIP('1.2.3.4.5')).toBe(false);
});

test('Target resolution logic (Domain - uppercase)', async () => {
    const dnsMock = async (d: string) => ['1.2.3.4'];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({ city: 'Mock City', country: 'Mock Country' });

    const result = await resolveTargetData('DOMAIN', 'example.com', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['1.2.3.4']);
    expect(result.geoData.city).toBe('Mock City');
});

test('Target resolution logic (Domain - lowercase)', async () => {
    const dnsMock = async (d: string) => ['1.2.3.4'];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({ city: 'Mock City', country: 'Mock Country' });

    const result = await resolveTargetData('domain', 'example.com', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['1.2.3.4']);
    expect(result.geoData.city).toBe('Mock City');
});

test('Target resolution logic (IP)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({ city: 'Mock City', country: 'Mock Country' });

    const result = await resolveTargetData('IP', '8.8.8.8', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['8.8.8.8']);
    expect(result.geoData.city).toBe('Mock City');
});

test('Target resolution logic (IP - lowercase)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({ city: 'Mock City', country: 'Mock Country' });

    const result = await resolveTargetData('ip', '8.8.8.8', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['8.8.8.8']);
    expect(result.geoData.city).toBe('Mock City');
});

test('Target resolution logic (Email)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => ['mx.example.com'];
    const geoMock = async (ip: string) => ({});

    const result = await resolveTargetData('EMAIL', 'user@example.com', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['mx.example.com']);
    expect(result.geoData).toEqual({}); // Email should not trigger geoip
});

test('Target resolution logic (Email - lowercase)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => ['mx.example.com'];
    const geoMock = async (ip: string) => ({});

    const result = await resolveTargetData('email', 'user@example.com', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual(['mx.example.com']);
    expect(result.geoData).toEqual({}); // Email should not trigger geoip
});

test('Target resolution logic (Username)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({});

    const result = await resolveTargetData('USERNAME', 'johndoe', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual([]);
    expect(result.geoData).toEqual({}); // Username should not trigger geoip
});

test('Target resolution logic (Username - lowercase)', async () => {
    const dnsMock = async (d: string) => [];
    const mxMock = async (d: string) => [];
    const geoMock = async (ip: string) => ({});

    const result = await resolveTargetData('username', 'johndoe', dnsMock, mxMock, geoMock);
    expect(result.resolvedIPs).toEqual([]);
    expect(result.geoData).toEqual({}); // Username should not trigger geoip
});