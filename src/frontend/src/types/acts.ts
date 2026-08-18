// Типы для раздела «Протоколы» — акт приёма-передачи дома в управление.

export interface ActBasis {
  meeting_decision_no?: string;   // № решения общего собрания
  meeting_decision_date?: string; // дата решения
  contract_no?: string;           // № договора управления
  contract_date?: string;         // дата договора
}

// Ключи чек-листа передаваемой техдокументации.
export type TechDocKey =
  | 'tech_passport'      // техпаспорт дома
  | 'floor_plans'        // поэтажные планы
  | 'engineering_schemes'// схемы инженерных сетей
  | 'elevator_passports' // паспорта лифтов
  | 'cadastral'          // кадастровые документы
  | 'keys'               // ключи от МОП
  | 'equipment';         // техсредства/оборудование

export interface ActOptions {
  has_parking: boolean;
  has_nonresidential: boolean;
  tech_docs: TechDocKey[];
  funds_amount?: number;          // остаток средств, сум
  free_text?: string;             // доп. положения (гибридный шаблон)
  transferor?: string;            // передающая сторона (прежняя УК / уполномоченный)
  receiver_signatory?: string;    // подписант со стороны собственников (председатель совета)
}

export interface ActCells {
  residential: number;
  parking: number;
  commercial: number;
}

export interface ActSnapshot {
  building_name?: string;
  address?: string;
  total_area?: number;
  living_area?: number;
  floors?: number;
  entrances?: number;
  cells?: ActCells;
}

export interface BuildingAct {
  id: string;
  building_id: string;
  act_type: string;
  act_number?: string;
  act_date?: string;
  basis: ActBasis;
  options: ActOptions;
  snapshot: ActSnapshot;
  created_at?: string;
}
