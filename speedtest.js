// Замер скорости скачивания: 10 последовательных запросов к одному адресу.
// Запуск: node speedtest.js <url>

const REQUEST_COUNT = 10;
const TIMEOUT_MS = 60_000; // на один запрос целиком, вместе с чтением тела

// Принимаем только http и https; на всё остальное возвращаем null.
function parseUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url;
  } catch {
    // строка не разбирается как URL
  }
  return null;
}

// Скачивает адрес один раз, возвращает длительность в мс и число байт.
async function downloadOnce(url) {
  const startedAt = performance.now();

  const response = await fetch(url, {
    // identity = просим не сжимать ответ. Иначе fetch сам распакует gzip,
    // и мы посчитаем распакованный объём, а не тот, что прошёл по сети.
    headers: { 'Accept-Encoding': 'identity' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`сервер ответил ${response.status} ${response.statusText}`);
  }

  // fetch возвращает управление, когда пришли заголовки. Тело дочитываем
  // по частям до конца: так дожидаемся полного ответа и не держим файл в памяти.
  let bytes = 0;
  for await (const chunk of response.body ?? []) {
    bytes += chunk.length;
  }

  if (bytes === 0) {
    throw new Error('сервер вернул пустой ответ');
  }

  return { ms: performance.now() - startedAt, bytes };
}

function describeError(error) {
  if (error.name === 'TimeoutError') {
    return `нет ответа за ${TIMEOUT_MS / 1000} с`;
  }
  // у сетевых ошибок fetch настоящая причина лежит в error.cause
  return error.cause?.message ?? error.message;
}

function formatMegabytes(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} МБ`;
}

async function main() {
  const url = parseUrl(process.argv[2]);

  if (!url) {
    console.error('Использование: node speedtest.js <url>');
    console.error('Пример: node speedtest.js https://registry.npmjs.org/typescript/-/typescript-5.4.5.tgz');
    process.exitCode = 1;
    return;
  }

  console.log(`Адрес: ${url.href}`);
  console.log(`Запросов: ${REQUEST_COUNT}, последовательно\n`);

  let totalMs = 0;
  let totalBytes = 0;

  for (let i = 1; i <= REQUEST_COUNT; i++) {
    let result;
    try {
      result = await downloadOnce(url);
    } catch (error) {
      console.error(`Запрос ${i} не удался: ${describeError(error)}`);
      process.exitCode = 1;
      return;
    }

    totalMs += result.ms;
    totalBytes += result.bytes;

    const number = String(i).padStart(2);
    console.log(`${number}. ${result.ms.toFixed(0)} мс, ${formatMegabytes(result.bytes)}`);
  }

  const averageMs = totalMs / REQUEST_COUNT;
  // байты -> биты (x8) -> мегабиты (/10^6), миллисекунды -> секунды (/1000)
  const megabitsPerSecond = (totalBytes * 8) / 1_000_000 / (totalMs / 1000);

  console.log(`\nСреднее время запроса: ${averageMs.toFixed(0)} мс`);
  console.log(`Скачано всего: ${formatMegabytes(totalBytes)} (${totalBytes} байт)`);
  console.log(`Скорость скачивания: ${megabitsPerSecond.toFixed(2)} Мбит/с`);
}

main();
