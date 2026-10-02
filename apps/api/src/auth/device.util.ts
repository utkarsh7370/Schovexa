// A short, human description of a browser from its User-Agent string, for
// "Devices & sessions" and sign-in alerts. Deliberately rough — it is shown
// to people so they can recognise their own devices, and is never used to
// make a security decision.

export interface DeviceInfo {
  browser: string;
  os: string;
  label: string;
}

export function describeDevice(userAgent: string | null | undefined): DeviceInfo {
  const ua = userAgent ?? '';
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown device', label: 'Unknown device' };

  const browser = /Edg(e|A|iOS)?\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|node|python|axios|okhttp|postman/i.test(ua)
              ? 'API client'
              : 'Unknown browser';

  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux|X11/.test(ua)
              ? 'Linux'
              : 'Unknown OS';

  return { browser, os, label: `${browser} on ${os}` };
}
