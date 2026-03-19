import {
  BranchesView,
  BuildingsView,
  EntrancesView,
  ResidentsForEntranceView,
  UploadModal,
  AddResidentModal,
  ResidentCardModal,
  DeleteConfirmModal,
  DeleteAllConfirmModal,
  ProgressIndicator,
  CreatedAccountsNotification,
  useResidentsLogic,
} from './shared/components/residents';

export function ResidentsPage() {
  const {
    language,
    currentUser,
    viewLevel,
    selectedBranch,
    selectedBuilding,
    selectedEntrance,
    branches,
    entrances,
    isLoadingBranches,
    isLoadingEntrances,
    isLoadingResidents,
    filteredBuildings,
    allResidents,
    filteredResidents,
    searchQuery,
    setSearchQuery,
    showUploadModal,
    setShowUploadModal,
    showAddManualModal,
    setShowAddManualModal,
    uploadedData,
    setUploadedData,
    uploadError,
    setUploadError,
    createdAccounts,
    setCreatedAccounts,
    showResidentCard,
    setShowResidentCard,
    editingPassword,
    setEditingPassword,
    newPassword,
    setNewPassword,
    showPassword,
    setShowPassword,
    editingName,
    setEditingName,
    editNameValue,
    setEditNameValue,
    savingName,
    nameToast,
    deleteConfirm,
    setDeleteConfirm,
    deleteAllConfirm,
    setDeleteAllConfirm,
    isDeleting,
    isCreating,
    progressMessage,
    fileInputRef,
    manualForm,
    setManualForm,
    DEFAULT_PASSWORD,
    handleBranchClick,
    handleBuildingClick,
    handleEntranceClick,
    handleBack,
    handleFileUpload,
    createAccountsFromData,
    handleManualAdd,
    handleDeleteResident,
    handleDeleteAllResidents,
    handleResidentClick,
    handleSavePassword,
    handleSaveName,
    copyToClipboard,
    getResidentPassword,
    extractApartmentFromAddress,
    calculateEntranceAndFloor,
    setViewLevel,
    setSelectedBranch,
    setSelectedBuilding,
    setSelectedEntrance,
  } = useResidentsLogic();

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{language === 'ru' ? 'Жители' : 'Yashovchilar'}</h1>
          <p className="text-gray-500 mt-1">{language === 'ru' ? 'Реестр собственников и жителей' : 'Mulkdorlar va aholi reestri'}</p>
        </div>
        <button
          onClick={() => setShowAddManualModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors font-medium text-sm shadow-sm"
        >
          <span className="text-lg leading-none">+</span>
          {language === 'ru' ? 'Добавить жителя' : 'Yashovchi qo\'shish'}
        </button>
      </div>

      {viewLevel === 'branches' && (
        <BranchesView
          branches={branches}
          isLoadingBranches={isLoadingBranches}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onBranchClick={handleBranchClick}
          language={language}
        />
      )}

      {viewLevel === 'buildings' && selectedBranch && (
        <BuildingsView
          selectedBranch={selectedBranch}
          filteredBuildings={filteredBuildings}
          onBuildingClick={handleBuildingClick}
          onBack={handleBack}
          language={language}
        />
      )}

      {viewLevel === 'entrances' && selectedBuilding && (
        <EntrancesView
          selectedBranch={selectedBranch}
          selectedBuilding={selectedBuilding}
          entrances={entrances}
          isLoadingEntrances={isLoadingEntrances}
          isLoadingResidents={isLoadingResidents}
          allResidents={allResidents}
          filteredResidents={filteredResidents}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onEntranceClick={handleEntranceClick}
          onBack={handleBack}
          onNavigateToBranches={() => {
            setViewLevel('branches');
            setSelectedBranch(null);
            setSelectedBuilding(null);
          }}
          onShowAddManual={() => setShowAddManualModal(true)}
          onShowUpload={() => setShowUploadModal(true)}
          onResidentClick={handleResidentClick}
          onDeleteAllClick={() => setDeleteAllConfirm(true)}
          language={language}
        />
      )}

      {viewLevel === 'residents' && selectedEntrance && selectedBuilding && (
        <ResidentsForEntranceView
          selectedBranch={selectedBranch}
          selectedBuilding={selectedBuilding}
          selectedEntrance={selectedEntrance}
          filteredResidents={filteredResidents}
          isLoadingResidents={isLoadingResidents}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onBack={handleBack}
          onNavigateToBranches={() => {
            setViewLevel('branches');
            setSelectedBranch(null);
            setSelectedBuilding(null);
            setSelectedEntrance(null);
          }}
          onNavigateToBuildings={() => {
            setViewLevel('buildings');
            setSelectedBuilding(null);
            setSelectedEntrance(null);
          }}
          onShowAddManual={() => setShowAddManualModal(true)}
          onShowUpload={() => setShowUploadModal(true)}
          onResidentClick={handleResidentClick}
          onDeleteAllClick={() => setDeleteAllConfirm(true)}
          language={language}
        />
      )}

      <ProgressIndicator
        isCreating={isCreating}
        isDeleting={isDeleting}
        progressMessage={progressMessage}
      />

      <CreatedAccountsNotification
        createdAccounts={createdAccounts}
        progressMessage={progressMessage}
        selectedBuilding={selectedBuilding}
        defaultPassword={DEFAULT_PASSWORD}
        onDismiss={() => setCreatedAccounts([])}
        language={language}
      />

      {showUploadModal && (
        <UploadModal
          uploadedData={uploadedData}
          uploadError={uploadError}
          isCreating={isCreating}
          selectedBuilding={selectedBuilding}
          defaultPassword={DEFAULT_PASSWORD}
          onClose={() => {
            setShowUploadModal(false);
            setUploadedData([]);
            setUploadError('');
          }}
          onFileUpload={handleFileUpload}
          onClearData={() => setUploadedData([])}
          onCreateAccounts={createAccountsFromData}
          extractApartmentFromAddress={extractApartmentFromAddress}
          calculateEntranceAndFloor={calculateEntranceAndFloor}
          fileInputRef={fileInputRef}
          language={language}
        />
      )}

      {showAddManualModal && (
        <AddResidentModal
          manualForm={manualForm}
          setManualForm={setManualForm}
          selectedBuilding={selectedBuilding}
          defaultPassword={DEFAULT_PASSWORD}
          onClose={() => setShowAddManualModal(false)}
          onSubmit={handleManualAdd}
          language={language}
        />
      )}

      {showResidentCard && (
        <ResidentCardModal
          resident={showResidentCard}
          currentUserRole={currentUser?.role ?? ''}
          editingPassword={editingPassword}
          setEditingPassword={setEditingPassword}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          editingName={editingName}
          setEditingName={setEditingName}
          editNameValue={editNameValue}
          setEditNameValue={setEditNameValue}
          savingName={savingName}
          nameToast={nameToast}
          getResidentPassword={getResidentPassword}
          onClose={() => {
            setShowResidentCard(null);
            setEditingPassword(false);
            setNewPassword('');
            setEditingName(false);
            setEditNameValue('');
          }}
          onDelete={() => setDeleteConfirm({ login: showResidentCard.login, name: showResidentCard.name })}
          onSavePassword={handleSavePassword}
          onSaveName={handleSaveName}
          onCopyToClipboard={copyToClipboard}
          language={language}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmModal
          name={deleteConfirm.name}
          isDeleting={isDeleting}
          onConfirm={() => handleDeleteResident(deleteConfirm.login)}
          onCancel={() => setDeleteConfirm(null)}
          language={language}
        />
      )}

      {deleteAllConfirm && (
        <DeleteAllConfirmModal
          count={filteredResidents.length}
          isDeleting={isDeleting}
          onConfirm={handleDeleteAllResidents}
          onCancel={() => setDeleteAllConfirm(false)}
          language={language}
        />
      )}
    </div>
  );
}
