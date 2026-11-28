# BLE payments for iPhone in Russia: the market, October 2026

What the Russian pitch page (`mizan-ble/pitch/`) says about the market, and
how well each claim is checked. "Checked" means the source itself was
read; "cited" means another review named the source and it has not been
read yet.

## Why BLE

- Apple Pay does not support Russian bank cards (since 2022). The ФАС
  position on NFC access in iOS is from April 2024 and does not by itself
  say what holds in October 2026. Checked:
  [РБК, 4 Apr 2024](https://www.rbc.ru/technology_and_media/04/04/2024/660e43199a79471f9fcea327).

## «Волна» (NSPK)

- Presented in October 2024: payment through СБП (and «Мир» cards) over
  BLE, from iOS and Android, with new Bluetooth-capable POS terminals.
  Checked:
  [Ведомости, 17 Oct 2024](https://www.vedomosti.ru/finance/news/2024/10/17/1069272-nspk-predstavila-prototip),
  [vc.ru](https://vc.ru/money/1590625-nspk-sozdala-prototip-resheniya-dlya-oplaty-pokupok-s-pomoshyu-smartfonov-na-ios-i-android-ono-rabotaet-na-osnove-bluetooth).
- NSPK publishes «СБП Volna SDK для ОС iOS» to speed up integration,
  distributed through support.nspk.ru under a simple non-exclusive
  licence. What it covers and what it leaves to the bank's app is not
  known yet. Checked: [nspk.ru/cards-mir/soft](https://nspk.ru/cards-mir/soft).
- Adoption: three banks tested it as issuer and acquirer; ПСБ finished in
  January 2026. Checked: [Хабр](https://habr.com/ru/news/1006346/).
  VTB launched on 3 June 2026. Cited:
  [Ведомости, 3 Jun 2026](https://www.vedomosti.ru/finance/news/2026/06/03/1202168-vtb-zapustil-beskontaktnuyu).
  The three Volna banks are ГПБ, ПСБ and ВТБ. Cited:
  [bosfera.ru](https://bosfera.ru/bo/s-kartoy-i-bez-novaya-konfiguraciya-ekvayringa).
- Scaling needs app work and terminal software updates (NSPK's own
  estimate, via Хабр). Checked.

## «Вжух» (Sber)

- Sber's BLE payment for iPhone, opened to partners. T-Bank's T-Pay for
  iPhone works with it. Cited:
  [РБК](https://amp.rbc.ru/rbcnews/rbcfreenews/68c2e0719a794763e0b430d5),
  [T-Bank's help page](https://www.tbank.ru/bank/help/payments/tinkoff-pay/how-to-pay-nfc/iphone/).
- Sovcombank joined on 26 August 2026. Cited:
  [АСРОС](https://asros.ru/news/members/vzhukh-i-eshche-odin-bank-k-tekhnologii-sbera-prisoedinilsya-sovkombank/).
- Its architecture as far as public sources and patents show: `vzhuh.md`.

## Accepting without a POS terminal (offer B)

- No source found ties Volna to a merchant's phone: the published
  descriptions all use Bluetooth terminals.
- NSPK's SoftPOS turns an Android phone with NFC into a terminal; it is
  NFC, not BLE. Checked: [nspk.ru/banks/acquiring](https://www.nspk.ru/banks/acquiring).
- MST's white-label SoftPOS is said to list Volna among its scenarios.
  Unconfirmed: the page timed out on every attempt.
  [mst-company.ru](https://mst-company.ru/uslugi/platjozhnye-resheniya/softpos-whitelabel).

## Regulation (not researched)

The review named 152-ФЗ, banking secrecy, 821-П, 851-П (certification or
an ОУД4 conformity assessment for some categories of software) and
ГОСТ Р 57580, and noted that PCI DSS scope follows the architecture.
None of this has been read against the pitch yet.
