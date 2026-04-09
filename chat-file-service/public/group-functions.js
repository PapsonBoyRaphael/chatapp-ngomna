// ========================================
// ✅ SECTION GROUPES ET ADMINS
// ========================================

/**
 * Créer un groupe
 */
async function createGroup() {
  const nameInput = document.getElementById("groupName");
  const membersInput = document.getElementById("groupMembers");
  const statusDiv = document.getElementById("createGroupStatus");

  const name = nameInput.value.trim();
  const membersStr = membersInput.value.trim();

  if (!name) {
    updateStatusDiv(statusDiv, "❌ Nom du groupe requis", "error");
    return;
  }

  const members = membersStr
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id);

  if (members.length === 0) {
    updateStatusDiv(statusDiv, "❌ Au moins un membre requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Création du groupe...", "info");

    const res = await fetch("/groups", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-id": currentUser?.userId || "unknown",
      },
      body: JSON.stringify({
        name,
        adminId: currentUser?.userId,
        members,
        type: "GROUP",
      }),
    });

    const data = await res.json();

    if (data.success) {
      updateStatusDiv(
        statusDiv,
        `✅ Groupe créé: ${data.data._id || data.data.id}`,
        "success",
      );
      log(`✅ Groupe créé: ${data.data.name}`, "success", data.data);
      nameInput.value = "";
      membersInput.value = "";
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      log("❌ Erreur création groupe", "error", data);
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    log("❌ Erreur création groupe", "error", err);
  }
}

/**
 * Ajouter un participant à un groupe
 */
async function addParticipantToGroup() {
  const groupIdInput = document.getElementById("groupIdAdd");
  const participantIdInput = document.getElementById("participantIdAdd");
  const statusDiv = document.getElementById("addParticipantStatus");

  const groupId = groupIdInput.value.trim();
  const participantId = participantIdInput.value.trim();

  if (!groupId || !participantId) {
    updateStatusDiv(statusDiv, "❌ ID groupe et participant requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Ajout du participant...", "info");

    const res = await fetch(`/groups/${groupId}/participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-id": currentUser?.userId || "unknown",
      },
      body: JSON.stringify({
        participantId,
        addedBy: currentUser?.userId,
      }),
    });

    const data = await res.json();

    if (data.success) {
      updateStatusDiv(statusDiv, "✅ Participant ajouté", "success");
      log(`✅ Participant ajouté au groupe`, "success", data);
      participantIdInput.value = "";
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      log("❌ Erreur ajout participant", "error", data);
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    log("❌ Erreur ajout participant", "error", err);
  }
}

/**
 * Promouvoir des membres comme admins
 */
async function addAdminsToGroup() {
  const groupIdInput = document.getElementById("groupIdAdmin");
  const userIdsInput = document.getElementById("adminUserIds");
  const statusDiv = document.getElementById("addAdminStatus");

  const groupId = groupIdInput.value.trim();
  const userIdsStr = userIdsInput.value.trim();

  if (!groupId || !userIdsStr) {
    updateStatusDiv(statusDiv, "❌ ID groupe et IDs membres requis", "error");
    return;
  }

  const userIds = userIdsStr
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id);

  if (userIds.length === 0) {
    updateStatusDiv(statusDiv, "❌ Au moins un ID membre requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Promotion des admins...", "info");

    const res = await fetch(`/groups/${groupId}/admins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-id": currentUser?.userId || "unknown",
      },
      body: JSON.stringify({
        userIds: userIds.length === 1 ? userIds[0] : userIds,
        promotedBy: currentUser?.userId,
      }),
    });

    const data = await res.json();

    if (data.success) {
      const promoted = data.data?.promoted || [];
      const skipped = data.data?.skipped || [];
      updateStatusDiv(
        statusDiv,
        `✅ ${promoted.length} admin(s) ajouté(s)${
          skipped.length > 0 ? `, ${skipped.length} déjà admin` : ""
        }`,
        "success",
      );
      log(`✅ Admins promus`, "success", data.data);
      userIdsInput.value = "";
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      log("❌ Erreur promotion admins", "error", data);
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    log("❌ Erreur promotion admins", "error", err);
  }
}

/**
 * Retirer un participant d'un groupe
 */
async function removeParticipantFromGroup() {
  const groupIdInput = document.getElementById("groupIdRemove");
  const participantIdInput = document.getElementById("participantIdRemove");
  const statusDiv = document.getElementById("removeParticipantStatus");

  const groupId = groupIdInput.value.trim();
  const participantId = participantIdInput.value.trim();

  if (!groupId || !participantId) {
    updateStatusDiv(statusDiv, "❌ ID groupe et participant requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Retrait du participant...", "info");

    const res = await fetch(
      `/groups/${groupId}/participants/${participantId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "user-id": currentUser?.userId || "unknown",
        },
        body: JSON.stringify({
          removedBy: currentUser?.userId,
        }),
      },
    );

    const data = await res.json();

    if (data.success) {
      updateStatusDiv(statusDiv, "✅ Participant retiré", "success");
      log(`✅ Participant retiré du groupe`, "success", data);
      participantIdInput.value = "";
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      log("❌ Erreur retrait participant", "error", data);
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    log("❌ Erreur retrait participant", "error", err);
  }
}

/**
 * Quitter un groupe
 */
async function leaveGroupAction() {
  const groupIdInput = document.getElementById("groupIdLeave");
  const statusDiv = document.getElementById("leaveGroupStatus");

  const groupId = groupIdInput.value.trim();

  if (!groupId) {
    updateStatusDiv(statusDiv, "❌ ID groupe requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Sortie du groupe...", "info");

    const res = await fetch(`/groups/${groupId}/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-id": currentUser?.userId || "unknown",
      },
      body: JSON.stringify({
        userId: currentUser?.userId,
      }),
    });

    const data = await res.json();

    if (data.success) {
      updateStatusDiv(statusDiv, "✅ Vous avez quitté le groupe", "success");
      log(`✅ Groupe quitté`, "success", data);
      groupIdInput.value = "";
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      log("❌ Erreur sortie groupe", "error", data);
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    log("❌ Erreur sortie groupe", "error", err);
  }
}

/**
 * Récupérer les détails d'un groupe
 */
async function getGroupDetails() {
  const groupIdInput = document.getElementById("groupIdGet");
  const statusDiv = document.getElementById("getGroupStatus");
  const outputDiv = document.getElementById("groupDetailsOutput");

  const groupId = groupIdInput.value.trim();

  if (!groupId) {
    updateStatusDiv(statusDiv, "❌ ID groupe requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Récupération des détails...", "info");

    const res = await fetch(`/groups/${groupId}`, {
      method: "GET",
      headers: {
        "user-id": currentUser?.userId || "unknown",
      },
    });

    const data = await res.json();

    if (data.success) {
      updateStatusDiv(statusDiv, "✅ Détails récupérés", "success");
      outputDiv.textContent = JSON.stringify(data.data, null, 2);
      log(`✅ Détails groupe récupérés`, "success", data.data);
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      outputDiv.textContent = "";
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    outputDiv.textContent = "";
  }
}

/**
 * Rechercher dans les groupes
 */
async function searchGroups() {
  const queryInput = document.getElementById("groupSearchQuery");
  const statusDiv = document.getElementById("searchGroupsStatus");
  const outputDiv = document.getElementById("searchGroupsOutput");

  const query = queryInput.value.trim();

  if (query.length < 2) {
    updateStatusDiv(statusDiv, "❌ Minimum 2 caractères requis", "error");
    return;
  }

  try {
    updateStatusDiv(statusDiv, "⏳ Recherche en cours...", "info");

    const res = await fetch(
      `/groups/search?query=${encodeURIComponent(query)}&limit=20`,
      {
        method: "GET",
        headers: {
          "user-id": currentUser?.userId || "unknown",
        },
      },
    );

    const data = await res.json();

    if (data.success) {
      const results = data.data || {};
      updateStatusDiv(
        statusDiv,
        `✅ ${results.totalGroups || 0} groupe(s) trouvé(s)`,
        "success",
      );
      outputDiv.textContent = JSON.stringify(results, null, 2);
      log(`✅ Recherche terminée`, "success", results);
    } else {
      updateStatusDiv(statusDiv, `❌ ${data.message || "Erreur"}`, "error");
      outputDiv.textContent = "";
    }
  } catch (err) {
    updateStatusDiv(statusDiv, `❌ ${err.message}`, "error");
    outputDiv.textContent = "";
  }
}

/**
 * Fonction utilitaire pour mettre à jour les divs de statut
 */
function updateStatusDiv(statusDiv, message, type) {
  if (!statusDiv) return;
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}
