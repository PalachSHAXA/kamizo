---
name: kamizo-i18n
description: "Localization agent for Kamizo. Ensures all UI text goes through languageStore (ru/uz). Finds hardcoded strings, adds translations. Trigger on: перевод, translate, локализация, i18n, язык, language, узбекский, русский. Use when adding any new UI text."
---

# Kamizo i18n — Localization Agent

All UI text MUST go through languageStore. Kamizo supports Russian (ru) and Uzbek (uz).

## How it works
File: src/frontend/src/stores/languageStore.ts
Usage: const { t } = useLanguageStore()
Template: t('key') returns localized string

## Rules
1. NEVER hardcode Russian or Uzbek text in JSX
2. Every new string → add to languageStore translations object
3. Key format: section.action — e.g., 'requests.create', 'chat.sendMessage'
4. Placeholders: t('requests.count', { count: 5 }) → "5 заявок" / "5 ta ariza"

## Audit command
grep -rn '"[А-Яа-яЁё]' src/frontend/src/pages/ --include="*.tsx" | grep -v "import\|console\|//"
This finds hardcoded Russian strings not going through t()

## When adding new feature
1. Write all strings in both ru and uz
2. Add to languageStore translations
3. Use t('key') in component
4. Test: switch language in app → verify all text changes
