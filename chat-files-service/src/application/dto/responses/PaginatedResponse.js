/**
 * DTO pour les réponses paginées
 * CENADI Chat-Files-Service
 */

class PaginatedResponse {
  constructor(data, pagination) {
    this.data = data;
    this.pagination = {
      page: pagination.page || 1,
      limit: pagination.limit || 20,
      total: pagination.total || 0,
      totalPages: pagination.totalPages || 0,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false
    };

    // Calculer les informations manquantes
    this.calculatePagination();
  }

  calculatePagination() {
    const { page, limit, total } = this.pagination;

    // Calculer le nombre total de pages
    this.pagination.totalPages = Math.ceil(total / limit);

    // Vérifier s'il y a une page suivante/précédente
    this.pagination.hasNext = page < this.pagination.totalPages;
    this.pagination.hasPrev = page > 1;

    // Ajouter des informations utiles
    this.pagination.startIndex = (page - 1) * limit + 1;
    this.pagination.endIndex = Math.min(page * limit, total);
    this.pagination.count = Array.isArray(this.data) ? this.data.length : 0;
  }

  toPlainObject() {
    return {
      data: this.data,
      pagination: this.pagination,
      meta: {
        timestamp: new Date().toISOString(),
        resultCount: this.pagination.count
      }
    };
  }

  // Version avec liens de navigation
  toObjectWithLinks(baseUrl) {
    const { page, limit, totalPages } = this.pagination;
    
    const links = {
      self: `${baseUrl}?page=${page}&limit=${limit}`,
      first: `${baseUrl}?page=1&limit=${limit}`,
      last: `${baseUrl}?page=${totalPages}&limit=${limit}`
    };

    if (this.pagination.hasPrev) {
      links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
    }

    if (this.pagination.hasNext) {
      links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
    }

    return {
      ...this.toPlainObject(),
      links
    };
  }

  // Créer une réponse vide
  static empty(page = 1, limit = 20) {
    return new PaginatedResponse([], {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false
    });
  }

  // Créer une réponse à partir de données complètes
  static fromQuery(data, queryResult) {
    return new PaginatedResponse(data, {
      page: queryResult.page,
      limit: queryResult.limit,
      total: queryResult.total,
      totalPages: queryResult.totalPages,
      hasNext: queryResult.hasNext,
      hasPrev: queryResult.hasPrev
    });
  }
}

module.exports = PaginatedResponse;
