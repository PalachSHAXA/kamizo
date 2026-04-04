// Barrel: registers all building-related routes
import { registerBranchRoutes } from './branches';
import { registerBranchExportRoutes } from './branch-export';
import { registerBranchImportRoutes } from './branch-import';
import { registerDistrictRoutes } from './districts';
import { registerBuildingCrudRoutes } from './buildings';
import { registerBuildingEditRoutes } from './buildings-edit';
import { registerEntranceRoutes } from './entrances';
import { registerApartmentRoutes } from './apartments';
import { registerApartmentEditRoutes } from './apartments-edit';
import { registerOwnerRoutes } from './owners';
import { registerAccountRoutes } from './accounts';
import { registerDebtReportRoutes } from './debt-reports';
import { registerResidentRoutes } from './residents';
import { registerMeterRoutes } from './meters';
import { registerMeterReadingRoutes } from './meter-readings';

export function registerBuildingRoutes() {
  registerBranchRoutes();
  registerBranchExportRoutes();
  registerBranchImportRoutes();
  registerDistrictRoutes();
  registerBuildingCrudRoutes();
  registerBuildingEditRoutes();
  registerEntranceRoutes();
  registerApartmentRoutes();
  registerApartmentEditRoutes();
  registerOwnerRoutes();
  registerAccountRoutes();
  registerDebtReportRoutes();
  registerResidentRoutes();
  registerMeterRoutes();
  registerMeterReadingRoutes();
}
