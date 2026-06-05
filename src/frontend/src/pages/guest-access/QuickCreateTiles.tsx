// Resident pass quick-create tiles — Claude Design §06-propuska 2x2 grid.
// Order: Гость · Такси · Доставка · Мастер (handoff). Each tile is a
// white surface with brand-tinted icon box; tap fires onPick with a
// QuickPreset shape so the parent opens the existing CreatePassForm
// with the preset visitor+access pre-filled. Source of truth:
// design/handoff/passes-handoff.md.

import { User, Car, Package, Wrench } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import type { QuickPreset } from './utils';

const TILES: QuickPreset[] = [
  {
    visitor: 'guest', access: 'day',
    icon: <User size={20} />, bg: '', fg: '',
    titleRu: 'Гость', titleUz: 'Mehmon',
    subRu: 'до 24 ч', subUz: '24 soatgacha',
  },
  {
    visitor: 'taxi', access: 'single_use',
    icon: <Car size={20} />, bg: '', fg: '',
    titleRu: 'Такси', titleUz: 'Taksi',
    subRu: '1 проезд', subUz: '1 marta',
  },
  {
    visitor: 'courier', access: 'single_use',
    icon: <Package size={20} />, bg: '', fg: '',
    titleRu: 'Доставка', titleUz: 'Yetkazib berish',
    subRu: 'на 2 ч', subUz: '2 soat',
  },
  {
    visitor: 'other', access: 'day',
    icon: <Wrench size={20} />, bg: '', fg: '',
    titleRu: 'Мастер', titleUz: 'Usta',
    subRu: 'по визиту', subUz: 'tashrif uchun',
  },
];

export function QuickCreateTiles({ onPick }: { onPick: (preset: QuickPreset) => void }) {
  const { language } = useLanguageStore();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {TILES.map((tile) => (
        <button
          key={`${tile.visitor}-${tile.access}`}
          type="button"
          onClick={() => onPick(tile)}
          style={{
            display: 'flex', alignItems: 'center', gap: 11,
            padding: 14,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border-c, #E6DFD2)',
            borderRadius: 20,
            boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(28,25,23,0.04))',
            cursor: 'pointer',
            textAlign: 'left',
            minWidth: 0,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--brand-tint, #FFF3EA)',
            color: 'var(--brand-dark, #EA580C)',
            display: 'grid', placeItems: 'center',
            flex: '0 0 auto',
          }}>
            {tile.icon}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
              color: 'var(--text-primary, #1C1917)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {language === 'ru' ? tile.titleRu : tile.titleUz}
            </div>
            <div style={{
              fontSize: 11.5, color: 'var(--text-secondary, #6F6A62)',
              marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {language === 'ru' ? tile.subRu : tile.subUz}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
