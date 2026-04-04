import { View } from './View.js';

export class ProductView extends View {
    // DOM elements
    #productList = document.querySelector('#productList');

    #buttons;
    // Templates and callbacks
    #productTemplate;
    #onBuyProduct;
    #bodyObserver = null;

    constructor() {
        super();
        this.init();
    }

    async init() {
        this.#productTemplate = await this.loadTemplate('./src/view/templates/product-card.html');
        if (window.MutationObserver && !this.#bodyObserver) {
            this.#bodyObserver = new MutationObserver(() => this._adjustColumns());
            this.#bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
    }

    onUserSelected(user) {
        // Enable buttons if a user is selected, otherwise disable them
        this.setButtonsState(user.id ? false : true);
    }

    registerBuyProductCallback(callback) {
        this.#onBuyProduct = callback;
    }

    render(products, disableButtons = true) {
        if (!this.#productTemplate) return;
        const html = products.map(product => {
            return this.replaceTemplate(this.#productTemplate, {
                id: product.id,
                name: product.name,
                category: product.category,
                price: product.price,
                color: product.color,
                product: JSON.stringify(product)
            });
        }).join('');

        this.#productList.innerHTML = html;
        this._adjustColumns();
        this.attachBuyButtonListeners();

        // Disable all buttons by default
        this.setButtonsState(disableButtons);
    }

    _adjustColumns() {
        const isOpen = document.body.classList.contains('tfvis-open');
        const desired = isOpen ? 'col-md-4' : 'col-md-3';
        const els = document.querySelectorAll('.product-col');
        els.forEach(el => {
            el.classList.remove('col-md-3', 'col-md-4');
            el.classList.add(desired);
        });
        // adjust header columns for user profile and model training
        const headerDesired = isOpen ? 'col-md-6' : 'col-md-4';
        const headerIds = ['userProfileCol', 'modelTrainingCol'];
        headerIds.forEach(id => {
            const headerEl = document.getElementById(id);
            if (headerEl) {
                headerEl.classList.remove('col-md-4', 'col-md-6');
                headerEl.classList.add(headerDesired);
            }
        });
    }

    setButtonsState(disabled) {
        if (!this.#buttons) {
            this.#buttons = document.querySelectorAll('.buy-now-btn');
        }
        this.#buttons.forEach(button => {
            button.disabled = disabled;
        });
    }

    attachBuyButtonListeners() {
        this.#buttons = document.querySelectorAll('.buy-now-btn');
        this.#buttons.forEach(button => {

            button.addEventListener('click', (event) => {
                const product = JSON.parse(button.dataset.product);
                const originalText = button.innerHTML;

                button.innerHTML = '<i class="bi bi-check-circle-fill"></i> Added';
                button.classList.remove('btn-primary');
                button.classList.add('btn-success');
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('btn-success');
                    button.classList.add('btn-primary');
                }, 500);
                this.#onBuyProduct(product, button);

            });
        });
    }
}
