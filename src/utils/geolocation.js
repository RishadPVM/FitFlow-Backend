const http = require('http');

/**
 * Checks if an IP is local/private.
 * @param {string} ip 
 * @returns {boolean}
 */
function isPrivateIp(ip) {
  if (!ip) return true;
  return (
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('::ffff:127.0.0.1')
  );
}

/**
 * Fetch location string from IP Address
 * @param {string} ipAddress 
 * @returns {Promise<string>}
 */
async function getIpLocation(ipAddress) {
  if (!ipAddress || isPrivateIp(ipAddress)) {
    return 'Localhost';
  }

  // Clean the IP address (e.g. if it has ::ffff: prefix)
  let cleanIp = ipAddress;
  if (ipAddress.startsWith('::ffff:')) {
    cleanIp = ipAddress.substring(7);
  }

  return new Promise((resolve) => {
    // 2-second timeout
    const timeout = setTimeout(() => {
      resolve('Unknown Location');
    }, 2000);

    const url = `http://ip-api.com/json/${cleanIp}`;

    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const json = JSON.parse(data);
          if (json && json.status === 'success') {
            const city = json.city || '';
            const country = json.countryCode || json.country || '';
            if (city && country) {
              resolve(`${city}, ${country}`);
            } else if (city || country) {
              resolve(city || country);
            } else {
              resolve('Unknown Location');
            }
          } else {
            resolve('Unknown Location');
          }
        } catch (e) {
          resolve('Unknown Location');
        }
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve('Unknown Location');
    });
  });
}

module.exports = {
  getIpLocation,
};
