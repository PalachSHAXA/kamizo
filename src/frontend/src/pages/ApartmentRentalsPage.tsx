// Resident-facing "Аренда квартир" announcement screen.
//
// Static informational page — the resident-side apartment-rentals
// feature does NOT exist for any tenant. There is:
//   • no browse-listings endpoint
//   • no submission form
//   • no backend model for resident listings
//   • no per-tenant enable toggle (unlike marketplace)
//
// This screen exists so the sidebar entry has a real destination —
// tapping opens this page instead of a modal or a dead route. Copy
// says "в разработке / скоро" honestly. Does NOT say "УК не
// подключила" — there is nothing for a УК to enable.
//
// Adminskaya /rentals surface (RentalsPage, allowedRoles=admin/
// manager/director) is a DIFFERENT thing — the УК-side contract
// table with tenants' personal data — and is unchanged by this
// screen. Route /apartment-rentals is resident-only static info.
//
// Reuses the .marketplace-page dark-theme scope from index.css so
// bg-white / text-gray-* / border-gray-* here get overridden in dark
// mode the same way the marketplace stub does — no repeat of the
// dark-mode bug we just fixed on that surface. The class name is a
// scope, not a semantic promise: this is a rentals screen, styled by
// the marketplace-page override block. If we later add a rental-only
// palette we split the scope; for now the palettes are identical.

import { ArrowLeft, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '../stores/languageStore';

export function ApartmentRentalsPage() {
  const { language } = useLanguageStore();
  const navigate = useNavigate();
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  return (
    // Full-page shell — mirrors MarketplacePage exactly.
    //  • `-mx-4 -mt-4 md:mx-0 md:mt-0` escapes Layout's page-content
    //    px-3 py-3 padding so the header + backdrop reach edge-to-edge.
    //  • Layout suppresses the shell MobileHeader for /apartment-rentals
    //    (Layout.tsx showMobileHeader exception list, same slot as
    //    /marketplace / /profile / /chat) — so ONLY the header below
    //    renders at the top; no stacked shell header.
    // marketplace-page scope class — inherits every html.dark override
    // in index.css: bg-white → --marketplace-surface, text-gray-* →
    // --marketplace-text-*, border-gray-100 → --marketplace-hairline,
    // bg-primary-50 → --brand-tint. Verified light + dark.
    <div className="marketplace-page pb-24 md:pb-0 -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-white">
      {/* Sticky page header — same pattern as MarketplacePage:
          - sticky top-0 z-40 so it pins to the top edge during scroll
          - env(safe-area-inset-top) so it clears the notch / Dynamic
            Island on notched iPhones (with the shell header gone,
            THIS is the topmost element and must respect the inset)
          - willChange: transform is the known Safari-sticky fix —
            without it the sticky behaviour "detaches" after the
            first overscroll on iOS WKWebView.
          - md:hidden — desktop uses the sidebar, no top bar. */}
      <div
        className="sticky top-0 z-40 bg-white border-b border-gray-100 md:hidden"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', willChange: 'transform' }}
      >
        <div className="px-4 pt-1.5 pb-2 flex items-center gap-2">
          {/* navigate('/') NOT navigate(-1) — a user arriving via
              typed URL has no history, and navigate(-1) would leave
              the app. Always land on home. */}
          <button
            onClick={() => navigate('/')}
            className="tap-target w-[38px] h-[38px] rounded-[13px] bg-gray-50 flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
            aria-label={t('Назад', 'Orqaga')}
          >
            <ArrowLeft className="w-[18px] h-[18px] text-gray-700" />
          </button>
          <h1 className="text-[16px] font-bold text-gray-900">
            {t('Аренда квартир', 'Kvartira ijarasi')}
          </h1>
        </div>
      </div>

      {/* Inner content — pb kept small; outer `pb-24` on the root
          div provides the BottomBar clearance. Double-padding would
          leave excess whitespace at the bottom of a short page. */}
      <div className="px-4 pt-6 pb-6 max-w-[560px] mx-auto">
        <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-4">
          <Key className="w-8 h-8 text-primary-500" />
        </div>

        <h2 className="text-[18px] font-bold text-gray-900 text-center mb-2">
          {t('Раздел в разработке', "Bo'lim ishlab chiqilmoqda")}
        </h2>

        <p className="text-[14px] text-gray-600 leading-relaxed text-center mb-6">
          {t(
            'Когда раздел появится, вы сможете смотреть квартиры, которые сдают в вашем ЖК, и разместить объявление о сдаче своей квартиры.',
            "Bo'lim tayyor bo'lganda, siz JK'ingizda ijaraga qo'yilgan kvartiralarni ko'ra olasiz va o'z kvartirangizni ijaraga qo'yish uchun e'lon joylashtira olasiz."
          )}
        </p>

        {/* Bullet list — kept lightweight; each line is one honest
            capability the resident-side feature will offer when
            shipped. No dates, no "coming Q3" language. */}
        <ul
          className="text-[13.5px] text-gray-600 leading-relaxed max-w-[440px] mx-auto space-y-2"
          style={{ listStyle: 'none', paddingLeft: 0 }}
        >
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
            />
            <span>
              {t(
                'Список свободных квартир только в вашем жилом комплексе.',
                "Faqat sizning turar-joy majmuangizda bo'sh kvartiralar ro'yxati."
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
            />
            <span>
              {t(
                'Разместить свою квартиру: фото, цена, условия — жители соседи увидят объявление.',
                "O'z kvartirangizni joylashtirish: rasm, narx, shartlar — qo'shnilar e'lonni ko'radi."
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0"
            />
            <span>
              {t(
                'Связь с арендодателем внутри приложения — без третьих сайтов.',
                "Ilova ichidan ijara beruvchi bilan bog'lanish — uchinchi tomon saytlarisiz."
              )}
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
