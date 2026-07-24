// Barrel for resident home widgets. Lets HomeTab import them via a single path.
//
// Previously also exported PaymentWidgetSoon, MetersWidgetSoon, MastersWidget
// "for reference" but they were never imported and dead-weight in the bundle.
// Audit P1 cleanup — deleted. Restore from git history if Click/Payme
// integration ever needs the original visual structure as a reference.
//
// v118.167 — ComingSoonPill removed. It had no consumers but was still
// re-exported through this barrel, which could keep its "Уже скоро" /
// "Скоро доступные функции" strings alive in tree-shaken bundles.
// Restore from git history alongside Payme/Click if ever needed.
export { NewsWidget } from './NewsWidget';
export { AutoWidget } from './AutoWidget';
export { PrivilegesWidget } from './PrivilegesWidget';
export { EventsWidget } from './EventsWidget';
