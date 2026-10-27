---
date: 2026-10-27
model: chat-gpt-6
---

# BLE Payment PoC — архитектура

## 1. Принципы

1. Одно приложение для iPhone и iPad, два режима: `Client` и `Host`.
2. `Client` и `Host` управляют только предметными сценариями оплаты.
3. Каждый компонент определяет **предоставляемые и требуемые полиморфные интерфейсы**.
4. Адаптеры преобразуют контракты; декораторы добавляют поведение, сохраняя контракт.
5. Один объект может реализовывать несколько интерфейсов.
6. Composition Root собирает произвольные комбинации адаптеров и декораторов.
7. Bluetooth, криптография, аутентификация и управление техническими сессиями остаются деталями реализации предметных интерфейсов.

## 2. Предметные компоненты

| Компонент | Ответственность | Предоставляет | Требует |
|---|---|---|---|
| `Client` | Клиентский сценарий оплаты | `ClientPaymentFlow` | `PaymentDiscovery`, `PaymentAcceptance` |
| `Host` | Сценарий приёма оплаты | `HostPaymentFlow` | `PaymentPublication`, `PaymentDecisionReceiver`, `PaymentResultPublisher`, `PaymentAuthorizer` |

### ClientPaymentFlow

```text
start()
select(offerId)
approve()
reject()
cancel()

events → ClientPaymentEvent
```

`Client` хранит выбранное предложение и управляет переходами своего сценария. Аутентификация пользователя происходит внутри реализации `PaymentAcceptance`.

### HostPaymentFlow

```text
createPayment(details)
cancelPayment()

events → HostPaymentEvent
```

`Host` хранит активный платёж, принимает решения и инициирует авторизацию.

## 3. Требуемые предметные интерфейсы

| Интерфейс | Операции | События / результат |
|---|---|---|
| `PaymentDiscovery` | `discover(.start / .stop)` | `PaymentOffer`, `DiscoveryFailure` |
| `PaymentAcceptance` | `submit(offerId, decision)` | `PaymentResult` или ошибка |
| `PaymentPublication` | `publish(offer)`, `withdraw(offerId)` | Результат публикации |
| `PaymentDecisionReceiver` | — | `ReceivedDecision` |
| `PaymentResultPublisher` | `publish(result, for: decisionId)` | Результат передачи |
| `PaymentAuthorizer` | `authorize(payment, approval)` | `PaymentResult` |

**События предоставляются отдельными выходными контрактами.** Подписка на события не управляет жизненным циклом поиска.

Для `PaymentDiscovery`:

```text
discover(.start)
    → события PaymentOffer / DiscoveryFailure

discover(.stop)
    → прекращение поиска
```

Повторный `.start` и `.stop` идемпотентны.

## 4. Предметные модели

**PaymentOffer**
- `offerId`
- `merchantId`
- `merchantName`
- `amount`
- `currency`
- `expiresAt`

**PaymentDecision**
- `offerId`
- `decisionId`
- `approved | rejected`

**PaymentResult**
- `offerId`
- `decisionId`
- `approved | declined | unknown`
- `reason`, если применимо

Технические идентификаторы BLE, криптографические ключи и сессии в предметные модели не включаются.

## 5. Композиция Client

```text
Client
 ├── PaymentDiscovery
 │    └── PaymentDiscoveryAdapter
 │         ├── PeerScanner
 │         ├── ConnectionOpener
 │         ├── SessionOpener
 │         └── OfferReader
 │
 └── PaymentAcceptance
      └── AuthenticationDecorator
           └── TimeoutDecorator
                └── PaymentAcceptanceAdapter
                     └── RequestResponse
```

`PaymentDiscoveryAdapter` преобразует обнаружение устройств, подключение и получение защищённого сообщения в предметное событие `PaymentOffer`.

`PaymentAcceptanceAdapter` преобразует предметное решение в протокольное сообщение.

Оба адаптера могут использовать один внутренний объект, связывающий `offerId` с действующей защищённой сессией. Это определяется композицией и не отражается в интерфейсах `Client`.

`AuthenticationDecorator` вызывает Face ID перед отправкой `approved`. Для `rejected` аутентификация не требуется.

`TimeoutDecorator` ограничивает ожидание результата, но возвращает `unknown`, если исход операции нельзя достоверно определить.

## 6. Композиция Host

```text
Host
 ├── PaymentPublication
 │    └── ExpirationDecorator
 │         └── PaymentPublicationAdapter
 │              └── PeerAdvertiser
 │
 ├── PaymentDecisionReceiver
 │    └── PaymentDecisionInboxAdapter
 │         └── MessageInbox
 │
 ├── PaymentResultPublisher
 │    └── PaymentResultAdapter
 │         └── MessageSender
 │
 └── PaymentAuthorizer
      └── IdempotencyDecorator
           └── LocalAuthorizer
```

`ExpirationDecorator` завершает публикацию по истечении срока предложения.

`IdempotencyDecorator` предотвращает повторную авторизацию одного `decisionId`, включая повторную доставку подтверждения.

Host проверяет соответствие решения активному предложению и его срок действия перед авторизацией.

## 7. Инфраструктурные контракты

| Интерфейс | Ответственность |
|---|---|
| `PeerScanner` | Обнаружение BLE-устройств |
| `PeerAdvertiser` | Публикация BLE-сервиса |
| `ConnectionOpener` | Открытие соединения |
| `ConnectionAcceptor` | Приём соединения |
| `FrameChannel` | Передача целых бинарных сообщений |
| `SessionOpener` | Установление защищённой сессии с Host |
| `SessionAcceptor` | Принятие защищённой сессии |
| `MessageSender` | Отправка протокольного сообщения |
| `MessageInbox` | Получение протокольного сообщения |
| `RequestResponse` | Сопоставление запросов и ответов |
| `PeerTrust` | Получение доверенных идентификаторов и ключей |
| `SessionCryptography` | Криптографические операции |
| `UserAuthenticator` | Локальная аутентификация |

Это контракты, а не обязательные отдельные классы или сервисы. Один объект может реализовывать несколько из них.

## 8. Транспортная композиция

```text
FrameChannel
  └── FramingAdapter
       └── BLEByteChannel
            └── CoreBluetooth
```

Для PoC:

- iPad — BLE Peripheral / GATT Server.
- iPhone — BLE Central / GATT Client.
- Advertising содержит UUID платёжного сервиса.
- iPhone отправляет данные через GATT Write With Response.
- iPad отправляет данные через GATT Notify.
- Фрейминг учитывает ограничения размера передачи и обратное давление.
- Оба приложения активны на экране.

Advertising сообщает о доступности Host. Полноценное предложение передаётся после подключения и проверки Host.

## 9. Защищённый обмен

```text
MessageSender / MessageInbox
  └── ProtectedMessagingDecorator
       └── MessageCodecAdapter
            └── FrameChannel
```

Установление сессии — отдельная композиция:

```text
SessionOpener / SessionAcceptor
  └── AuthenticatedSessionAdapter
       ├── PeerTrust
       ├── SessionCryptography
       └── FrameChannel
```

### Модель доверия

1. Client предварительно получает доверенный публичный ключ Host через QR-код.
2. При подключении Host подтверждает владение соответствующим приватным ключом.
3. Стороны устанавливают защищённый контекст.
4. Сообщения привязываются к сессии и идентификаторам платежа.
5. Повторные сообщения распознаются и не вызывают повторную авторизацию.

Начальная криптографическая реализация — HPKE.

Замена на JWE допустима через полиморфные контракты при сохранении требований к аутентификации, целостности, привязке к сессии и защите от повторов.

## 10. Последовательность

| № | Действие | Предметный интерфейс |
|---|---|---|
| 1 | Host создаёт платёж | `HostPaymentFlow` |
| 2 | Host публикует предложение | `PaymentPublication` |
| 3 | Client начинает поиск | `PaymentDiscovery.discover(.start)` |
| 4 | Реализация обнаруживает Host, подключается и устанавливает защищённую сессию | Внутренняя композиция |
| 5 | Client получает предложение | Событие `PaymentOffer` |
| 6 | Пользователь выбирает предложение | `ClientPaymentFlow.select` |
| 7 | Пользователь подтверждает | `ClientPaymentFlow.approve` |
| 8 | Декоратор выполняет Face ID | Внутренняя композиция `PaymentAcceptance` |
| 9 | Отправляется подтверждение | `PaymentAcceptance.submit` |
| 10 | Host получает решение | `PaymentDecisionReceiver` |
| 11 | Host авторизует платёж | `PaymentAuthorizer.authorize` |
| 12 | Host отправляет результат | `PaymentResultPublisher.publish` |
| 13 | Client получает результат | Завершение `PaymentAcceptance.submit` |
| 14 | Оба компонента уведомляют UI | События `ClientPaymentFlow` и `HostPaymentFlow` |

При отмене поиска Client вызывает `PaymentDiscovery.discover(.stop)`. Реализация прекращает обнаружение и освобождает ресурсы, которые больше не нужны. Сессия уже выбранного предложения может сохраняться для `PaymentAcceptance` — это внутренняя политика композиции.

## 11. Ошибки и жизненный цикл

| Ситуация | Контрактное поведение |
|---|---|
| Bluetooth недоступен | `DiscoveryFailure` |
| Host не прошёл проверку | Предложение не выдаётся Client; сообщается ошибка обнаружения |
| Поиск отменён | `discover(.stop)`; новые предложения не выдаются |
| Предложение истекло | `submit` завершается отказом по сроку действия |
| Face ID отменён | Подтверждение не отправляется |
| Соединение разорвано до отправки | Ошибка отправки |
| Соединение разорвано после возможной отправки | `PaymentResult.unknown` |
| Подтверждение доставлено повторно | Идемпотентная обработка |
| Результат не доставлен | Host сохраняет результат; Client получает `unknown` |

## 12. Проверка SOLID

| Принцип | Как обеспечивается |
|---|---|
| **SRP** | Предметные сценарии, преобразование контрактов и независимые политики разделены |
| **OCP** | Новые политики добавляются декораторами; реализации заменяются через порты |
| **LSP** | Все реализации и декораторы сохраняют поведенческие гарантии интерфейсов |
| **ISP** | Компоненты требуют только необходимые им возможности |
| **DIP** | Предметные компоненты зависят от собственных контрактов, а не от инфраструктуры |

**Проверка на связанность:** `Client` и `Host` не импортируют CoreBluetooth, LocalAuthentication или криптографические библиотеки. Их интерфейсы не содержат технических сессий, соединений, ключей или BLE-идентификаторов.

**Проверка на реализуемость:** выбранные BLE-роли, GATT write/notify, передача предложений после подключения и фрагментация совместимы с моделью CoreBluetooth.

---

## Итог

Архитектура теперь определяется **контрактами потребителей и композицией их реализаций**, а не заранее установленной иерархией инфраструктурных компонентов.

`Client` и `Host` отвечают за платёжные сценарии. Адаптеры связывают предметные и технические контракты. Декораторы добавляют Face ID, тайм-ауты, сроки действия, идемпотентность и защиту сообщений. Composition Root определяет конкретные сочетания.

Это завершённая **компонентная архитектура PoC**. Детальный бинарный формат сообщений и криптографическое рукопожатие относятся к следующему уровню проектирования — спецификации протокола.
