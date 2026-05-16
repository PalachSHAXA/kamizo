// Sprint 28: shared label tables for ColleaguesSection children.
// Was an inline `getLabels()` factory in the parent page — moved
// here so RatingModal and EmployeeProfile can import directly.

export function getColleagueLabels(language: 'ru' | 'uz') {
  return {
    criteriaLabels: {
      professionalKnowledge: language === 'ru' ? 'Профессиональные знания' : 'Kasbiy bilimlar',
      legislationKnowledge: language === 'ru' ? 'Знание законодательства' : 'Qonunchilik bilimi',
      analyticalSkills: language === 'ru' ? 'Аналитические способности' : 'Tahlil qobiliyati',
      qualityOfWork: language === 'ru' ? 'Качество работы' : 'Ish sifati',
      execution: language === 'ru' ? 'Исполнительность' : 'Ijro etish',
      reliability: language === 'ru' ? 'Надёжность' : 'Ishonchlilik',
      teamwork: language === 'ru' ? 'Командность' : 'Jamoaviy ishlash',
      communication: language === 'ru' ? 'Коммуникация' : 'Muloqat',
      initiative: language === 'ru' ? 'Инициативность' : 'Tashabbusi',
      humanity: language === 'ru' ? 'Человечность' : 'Insoniylik',
    },
  };
}
