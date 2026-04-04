import { View } from './View.js';

export class TFVisorView extends View {
    #weights = null;
    #catalog = [];
    #users = [];
    #logs = [];
    #lossPoints = [];
    #accPoints = [];
    constructor() {
        super();
        this._ensureSidebar();
        this._attachOpenButton();
    }

    _ensureSidebar() {
        if (!document.getElementById('tfvisSidebar')) {
            const sidebar = document.createElement('div');
            sidebar.id = 'tfvisSidebar';
            sidebar.className = 'tfvis-sidebar';
            sidebar.style.display = 'none';

            const header = document.createElement('div');
            header.className = 'tfvis-header';

            const title = document.createElement('div');
            title.innerHTML = '<strong>Treinamento</strong>';

            const btns = document.createElement('div');

            const hideBtn = document.createElement('button');
            hideBtn.id = 'tfvis-hide-btn';
            hideBtn.className = 'btn btn-sm btn-outline-secondary';
            hideBtn.innerText = 'Hide';
            hideBtn.addEventListener('click', () => {
                this.hideSidebar();
            });

            btns.appendChild(hideBtn);
            header.appendChild(title);
            header.appendChild(btns);

            sidebar.appendChild(header);

            const precisionDiv = document.createElement('div');
            precisionDiv.id = 'tfvis-precision';
            sidebar.appendChild(precisionDiv);

            const lossDiv = document.createElement('div');
            lossDiv.id = 'tfvis-loss';
            lossDiv.style.marginTop = '12px';
            sidebar.appendChild(lossDiv);

            document.body.appendChild(sidebar);
        }
    }

    _attachOpenButton() {
        const openBtn = document.getElementById('openTrainingBtn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                this.showSidebar();
            });
        }
    }

    showSidebar() {
        const sidebar = document.getElementById('tfvisSidebar');
        if (!sidebar) return;
        sidebar.style.display = 'block';
        document.body.classList.add('tfvis-open');
        const openBtn = document.getElementById('openTrainingBtn');
        if (openBtn) openBtn.style.display = 'none';
    }

    hideSidebar() {
        const sidebar = document.getElementById('tfvisSidebar');
        if (!sidebar) return;
        sidebar.style.display = 'none';
        document.body.classList.remove('tfvis-open');
        const openBtn = document.getElementById('openTrainingBtn');
        if (openBtn) openBtn.style.display = 'inline-block';
    }

    renderData(data) {
        this.#weights = data.weights;
        this.#catalog = data.catalog;
        this.#users = data.users;
    }
    resetDashboard() {
        this.#weights = null;
        this.#catalog = [];
        this.#users = [];
        this.#logs = [];
        this.#lossPoints = [];
        this.#accPoints = [];
    }

    handleTrainingLog(log) {
        const { epoch, loss, accuracy } = log;
        this.#lossPoints.push({ x: epoch, y: loss });
        this.#accPoints.push({ x: epoch, y: accuracy });
        this.#logs.push(log);

        this.showSidebar();

        const precisionContainer = document.getElementById('tfvis-precision');
        const lossContainer = document.getElementById('tfvis-loss');

        if (precisionContainer) {
            tfvis.render.linechart(precisionContainer, { values: this.#accPoints, series: ['precisão'] }, {
                xLabel: 'Época (Ciclos de Treinamento)',
                yLabel: 'Precisão (%)',
                height: 300
            });
        }

        if (lossContainer) {
            tfvis.render.linechart(lossContainer, { values: this.#lossPoints, series: ['erros'] }, {
                xLabel: 'Época (Ciclos de Treinamento)',
                yLabel: 'Valor do Erro',
                height: 300
            });
        }
    }


}
