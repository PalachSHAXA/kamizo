import { CheckCircle } from 'lucide-react';
import { PageSkeleton } from '../components/PageSkeleton';

import {
  BranchesView,
  BuildingsView,
  EntrancesView,
  ApartmentSidePanel,
  DistrictModal,
  BranchModal,
  BuildingModal,
  EntranceModal,
  EntranceEditModal,
  ImportModal,
  DeleteDistrictConfirm,
  BuildingsTopBar,
  LegendBar,
  useBuildingsState,
} from './shared/components/buildings';

export function BuildingsPage() {
  const s = useBuildingsState();

  // Loading
  if ((s.isLoadingBranches && s.branches.length === 0 && s.viewLevel === 'branches') || (s.isLoadingBuildings && s.buildings.length === 0 && s.viewLevel === 'buildings')) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="flex flex-col h-full -m-3 sm:-m-4 md:-m-6 pb-24 md:pb-0" style={{ fontFamily: "'Onest', sans-serif" }}>
      <BuildingsTopBar
        viewLevel={s.viewLevel}
        selectedDistrict={s.selectedDistrict}
        selectedBranch={s.selectedBranch}
        selectedBuilding={s.selectedBuilding}
        apartments={s.apartments}
        entrances={s.entrances}
        isGenerating={s.isGenerating}
        exportingBranchId={s.exportingBranchId}
        canManageImportExport={!!s.canManageImportExport}
        language={s.language}
        onBack={s.handleBack}
        onBreadcrumbDistricts={() => { s.setViewLevel('branches'); s.setSelectedBranch(null); s.setSelectedBuilding(null); s.closeSidePanel(); }}
        onBreadcrumbBranches={() => { s.setViewLevel('branches'); s.setSelectedBranch(null); s.setSelectedBuilding(null); s.closeSidePanel(); }}
        onBreadcrumbBuildings={() => { s.setViewLevel('buildings'); s.setSelectedBuilding(null); s.closeSidePanel(); }}
        onRefresh={() => {
          if (s.viewLevel === 'branches') s.fetchBranches();
          else if (s.viewLevel === 'buildings' && s.selectedBranch) s.fetchBuildingsForBranch(s.selectedBranch.id);
          else if (s.viewLevel === 'entrances' && s.selectedBuilding) { s.fetchEntrancesForBuilding(s.selectedBuilding.id); s.fetchApartmentsForBuilding(s.selectedBuilding.id); }
        }}
        onGenerateApartments={s.handleGenerateApartments}
        onAddApartment={s.startAddApartment}
        onExportBranch={s.handleExportBranch}
        onOpenImport={() => { s.setImportFile(null); s.setImportResult(null); s.setShowImportModal(true); }}
        onAdd={() => {
          if (s.viewLevel === 'branches') s.setShowAddBranchModal(true);
          else if (s.viewLevel === 'buildings') s.setShowAddBuildingModal(true);
          else if (s.viewLevel === 'entrances') s.setShowAddEntranceModal(true);
        }}
      />

      {s.viewLevel === 'entrances' && s.apartments.length > 0 && (
        <LegendBar apartments={s.apartments} language={s.language} />
      )}

      {/* LAYOUT */}
      <div className="flex flex-1 overflow-hidden">
        {s.viewLevel === 'branches' && (
          <BranchesView
            searchedBranches={s.searchedBranches}
            selectedDistrict={s.selectedDistrict}
            allDistricts={s.allDistricts}
            searchQuery={s.searchQuery}
            setSearchQuery={s.setSearchQuery}
            language={s.language}
            canManageImportExport={!!s.canManageImportExport}
            exportingBranchId={s.exportingBranchId}
            onBranchClick={s.handleBranchClick}
            onEditBranch={s.setEditingBranch}
            onDeleteBranch={s.handleDeleteBranch}
            onExportBranch={s.handleExportBranch}
            onShowAddBranchModal={() => s.setShowAddBranchModal(true)}
            onDistrictFilter={s.handleDistrictFilter}
          />
        )}

        {s.viewLevel === 'buildings' && (
          <BuildingsView
            searchedBuildings={s.searchedBuildings}
            searchQuery={s.searchQuery}
            setSearchQuery={s.setSearchQuery}
            language={s.language}
            onBuildingClick={s.handleBuildingClick}
            onEditBuilding={s.setEditingBuilding}
            onDeleteBuilding={s.handleDeleteBuilding}
          />
        )}

        {s.viewLevel === 'entrances' && (
          <EntrancesView
            entrances={s.entrances}
            apartments={s.apartments}
            selectedBuilding={s.selectedBuilding}
            selectedApartment={s.selectedApartment}
            isLoadingEntrances={s.isLoadingEntrances}
            isLoadingApartments={s.isLoadingApartments}
            isGenerating={s.isGenerating}
            language={s.language}
            user={s.user}
            sortedEntrances={s.sortedEntrances}
            entranceMap={s.entranceMap}
            floors={s.floors}
            onApartmentClick={s.handleApartmentClick}
            onEditEntrance={s.setEditingEntrance}
            onGenerateApartments={s.handleGenerateApartments}
          />
        )}

        <ApartmentSidePanel
          panelOpen={s.panelOpen}
          selectedApartment={s.selectedApartment}
          isEditingApartment={s.isEditingApartment}
          isAddingApartment={s.isAddingApartment}
          editForm={s.editForm}
          setEditForm={s.setEditForm}
          isSavingApartment={s.isSavingApartment}
          isLoadingResidents={s.isLoadingResidents}
          apartmentResidents={s.apartmentResidents}
          entrances={s.entrances}
          language={s.language}
          onClose={s.closeSidePanel}
          onSaveApartment={s.handleSaveApartment}
          onCancelEdit={s.cancelEdit}
          onStartEdit={s.startEditApartment}
          onDeleteApartment={s.handleDeleteApartment}
        />
      </div>

      {/* MODALS */}
      {s.showAddDistrictModal && (
        <DistrictModal
          onClose={() => s.setShowAddDistrictModal(false)}
          onSave={(districtName) => {
            s.setShowAddDistrictModal(false);
            s.setSelectedDistrict(districtName);
            s.setViewLevel('branches');
          }}
          language={s.language}
        />
      )}

      {s.deleteDistrictConfirm && (
        <DeleteDistrictConfirm
          districtName={s.deleteDistrictConfirm}
          branches={s.branches}
          isDeletingDistrict={s.isDeletingDistrict}
          cascadeConfirmChecked={s.cascadeConfirmChecked}
          setCascadeConfirmChecked={s.setCascadeConfirmChecked}
          language={s.language}
          onClose={() => { s.setDeleteDistrictConfirm(null); s.setCascadeConfirmChecked(false); }}
          onDelete={s.handleDeleteDistrict}
        />
      )}

      {s.showAddBranchModal && (
        <BranchModal branch={null} onClose={() => s.setShowAddBranchModal(false)} onSave={s.handleAddBranch} language={s.language} defaultDistrict={s.selectedDistrict || ''} districts={s.allDistricts} />
      )}
      {s.editingBranch && (
        <BranchModal branch={s.editingBranch} onClose={() => s.setEditingBranch(null)} onSave={(data) => s.handleUpdateBranch(s.editingBranch!.id, data)} language={s.language}
          canEditCode={!!(s.user && ['admin', 'director', 'super_admin'].includes(s.user.role))}
          onChangeCode={(newCode) => s.handleChangeCode(s.editingBranch!.id, newCode)} districts={s.allDistricts} />
      )}
      {s.showAddBuildingModal && (
        <BuildingModal building={null} onClose={() => s.setShowAddBuildingModal(false)} onSave={s.handleAddBuilding} language={s.language} />
      )}
      {s.editingBuilding && (
        <BuildingModal building={s.editingBuilding} onClose={() => s.setEditingBuilding(null)} onSave={(data) => s.handleUpdateBuilding(s.editingBuilding!.id, data)} language={s.language} />
      )}
      {s.showAddEntranceModal && (
        <EntranceModal onClose={() => s.setShowAddEntranceModal(false)} onSave={s.handleAddEntrance} existingEntrances={s.entrances} language={s.language} />
      )}
      {s.editingEntrance && (
        <EntranceEditModal
          entrance={s.editingEntrance}
          existingApartmentCount={s.apartments.filter(a => a.entrance_id === s.editingEntrance!.id).length}
          onClose={() => s.setEditingEntrance(null)}
          onSave={(data) => s.handleSaveEntrance(s.editingEntrance!.id, data)}
          language={s.language}
        />
      )}

      {/* Entrance edit toast */}
      {s.entranceEditToast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2 bg-green-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl" style={{ bottom: 'calc(var(--bottom-bar-h, 64px) + 12px)' }}>
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {s.entranceEditToast}
        </div>
      )}

      {s.showImportModal && (
        <ImportModal
          importFile={s.importFile}
          setImportFile={(file) => { s.setImportFile(file); s.setImportResult(null); }}
          importLoading={s.importLoading}
          importResult={s.importResult}
          language={s.language}
          onClose={() => s.setShowImportModal(false)}
          onSubmit={s.handleImportSubmit}
        />
      )}
    </div>
  );
}
