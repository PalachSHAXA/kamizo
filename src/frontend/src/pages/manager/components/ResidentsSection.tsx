import { Phone, MapPin, Home } from 'lucide-react';
import { useDataStore } from '../../../stores/dataStore';
import { useLanguageStore } from '../../../stores/languageStore';
import { pluralWithCount } from '../../../utils/plural';
import { formatName } from '../../../utils/formatName';

// Residents Section - used in ResidentsPage
export function ResidentsSection() {
  const { requests } = useDataStore();
  const { language } = useLanguageStore();

  // Get unique residents from requests
  const residents = Array.from(
    new Map(
      requests.map(r => [r.residentId, {
        id: r.residentId,
        name: r.residentName,
        phone: r.residentPhone,
        address: r.address,
        apartment: r.apartment
      }])
    ).values()
  );

  const getResidentStats = (residentId: string) => {
    const residentRequests = requests.filter(r => r.residentId === residentId);
    return {
      total: residentRequests.length,
      completed: residentRequests.filter(r => r.status === 'completed').length,
      active: residentRequests.filter(r => !['completed', 'cancelled'].includes(r.status)).length
    };
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg md:text-xl xl:text-2xl font-bold">{language === 'ru' ? 'Жители' : 'Yashovchilar'}</h2>
            <p className="text-xs md:text-sm text-gray-500">
              {pluralWithCount(
                language === 'ru' ? 'ru' : 'uz',
                residents.length,
                { one: 'житель в системе', few: 'жителя в системе', many: 'жителей в системе' },
                { one: 'tizimda yashovchi', other: 'tizimda yashovchi' }
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 md:space-y-3">
        {residents.length === 0 ? (
          <div className="glass-card p-6 md:p-8 text-center">
            <Home className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-2 md:mb-3" />
            <h3 className="text-base md:text-lg font-medium text-gray-600">{language === 'ru' ? 'Жителей пока нет' : 'Yashovchilar hali yo\'q'}</h3>
            <p className="text-gray-400 mt-1 text-sm">{language === 'ru' ? 'Жители появятся после создания заявок' : 'Arizalar yaratilgandan keyin yashovchilar paydo bo\'ladi'}</p>
          </div>
        ) : (
          residents.map((resident) => {
            const stats = getResidentStats(resident.id);
            return (
              <div key={resident.id} className="glass-card p-3 sm:p-4 md:p-5 xl:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 md:gap-4 min-w-0">
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-full flex items-center justify-center text-sm md:text-lg font-medium text-primary-700 flex-shrink-0">
                      {resident.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm md:text-base truncate" title={resident.name}>{formatName(resident.name)}</div>
                      <div className="text-xs md:text-sm text-gray-500 flex flex-wrap items-center gap-2 md:gap-3">
                        {resident.phone && (
                          <a
                            href={`tel:${resident.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 hover:text-primary-600 active:text-primary-700 touch-manipulation"
                          >
                            <Phone className="w-3 h-3" />
                            {resident.phone}
                          </a>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate max-w-[100px] md:max-w-none">{language === 'ru' ? 'кв.' : 'kv.'} {resident.apartment}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm justify-end sm:justify-start flex-shrink-0">
                    <div className="text-center">
                      <div className="font-bold">{stats.total}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'всего' : 'jami'}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-green-600">{stats.completed}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'вып.' : 'baj.'}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-amber-600">{stats.active}</div>
                      <div className="text-gray-500">{language === 'ru' ? 'акт.' : 'faol'}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
