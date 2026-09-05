const DATABASE = 'sbuddy-assets';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('assets');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('照片存储不可用，请检查浏览器的存储权限。'));
  });
}
export async function assetTransaction(
  values?: Record<string, string>,
): Promise<Record<string, string>> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('assets', values ? 'readwrite' : 'readonly');
    const store = tx.objectStore('assets');
    const result: Record<string, string> = {};
    if (values)
      Object.entries(values).forEach(([key, value]) => store.put(value, key));
    else {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (
            typeof cursor.key === 'string' &&
            typeof cursor.value === 'string'
          )
            result[cursor.key] = cursor.value;
          cursor.continue();
        }
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(new Error('照片保存失败，可能已超过浏览器存储空间。'));
    };
  });
}
export async function clearAssets(): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    tx.objectStore('assets').clear();
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error('清理照片失败。'));
    };
  });
}
