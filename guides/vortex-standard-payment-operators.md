---
date: 2025-12-02
model: gpt-5
description: "Standard payment operators flow: reload/caching, serial-based fetch, storage, and paging."
---

## Fetching operators for standard payments

1. **Decorated reload** – `RootViewModelFactory.composeDecoratedServiceCategoryListLoaders()` wraps the base category reload and feeds every `.standard` category through `cachingLoadOperatorList`. That path chains `Batcher` → `UpdatingLoadDecorator` → `SerialStampedCachingDecorator`, tracking per-category load states and only refetching from the network when the backend-side serial changes. (`RootViewModelFactory+composeDecoratedServiceCategoryListLoaders.swift`.)

2. **Serial-based HTTP call** – The actual request is built by `RequestFactory.getOperatorsListByParam(serial:type:)`, using `operatorOnly=true` plus the `serial` and category `type`. The response is mapped via `RemoteServices.ResponseMapper.mapGetOperatorsListByParamOperatorOnlyTrueResponse`, which extracts the provider list and the new serial stamp. (`RequestFactory+getOperatorsListByParam.swift`, `ResponseMapper+mapGetOperatorsListByParamOperatorOnlyTrueResponse.swift`.)

3. **Caching storage** – Results are normalized to `CodableServicePaymentOperator` and stored inside `ServicePaymentOperatorStorage`, a `VortexTools.CategorizedStorage<ServiceCategory.CategoryType, CodableServicePaymentOperator>`. The storage keeps each category’s item list and last serial, so the caching decorator can skip refetching when nothing changed. (`RootViewModelFactory+composeDecoratedServiceCategoryListLoaders.swift` lines around cacheOperatorList, `CategorizedStorage.swift`.)

4. **Paging filtered reads** – When the UI needs operators it calls `RootViewModelFactory.loadCachedOperators(payload:)`. On a background scheduler it loads the storage, filters the array with `CodableServicePaymentOperator.matches(_:)` (category + optional search text), and calls `.page(for: payload)` so the `pageSize` and optional `operatorID` control how many providers (and from which starting point) return per call. (`RootViewModelFactory+loadCachedOperators.swift`, `VortexTools/Page/FilterableItemPage.swift`, `VortexTools/Page/PageQuery.swift`.)

5. **Utility provider adapter** – Each paged `CodableServicePaymentOperator` is mapped to `UtilityPaymentProvider` so downstream UI doesn't need cache internals. (`RootViewModelFactory+loadCachedOperators.swift` adapter block at the end.)
