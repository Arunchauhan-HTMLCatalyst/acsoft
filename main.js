/* ==========================================================================
   ACSOFT JavaScript Logic (Handcrafted & Minimal)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       Sticky Header and Navigation
       ========================================================================== */
    const header = document.querySelector('.header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    /* ==========================================================================
       Mobile Hamburger Menu Navigation
       ========================================================================== */
    const menuToggle = document.getElementById('menuToggle');
    const mobileNav = document.getElementById('mobileNav');
    const mobileLinks = document.querySelectorAll('.mobile-link');
    const body = document.body;

    function toggleMenu() {
        menuToggle.classList.toggle('active');
        mobileNav.classList.toggle('active');
        
        // Prevent body scrolling when menu is open
        if (mobileNav.classList.contains('active')) {
            body.style.overflow = 'hidden';
        } else {
            body.style.overflow = '';
        }
    }

    if (menuToggle && mobileNav) {
        menuToggle.addEventListener('click', toggleMenu);
    }

    // Close menu when a link is clicked
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (mobileNav.classList.contains('active')) {
                toggleMenu();
            }
        });
    });

    /* ==========================================================================
       Scroll Reveal Intersection Observer
       ========================================================================== */
    const revealElements = document.querySelectorAll('.reveal');
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target); // Trigger only once
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => revealObserver.observe(el));

    /* ==========================================================================
       Contact Form Submission (Validation & AJAX FormSubmit integration)
       ========================================================================== */
    const bookingForm = document.getElementById('bookingForm');
    const formName = document.getElementById('formName');
    const formBusiness = document.getElementById('formBusiness');
    const formPhone = document.getElementById('formPhone');
    const formEmail = document.getElementById('formEmail');
    const formProjectType = document.getElementById('formProjectType');
    const formBudget = document.getElementById('formBudget');
    const formMessage = document.getElementById('formMessage');
    const formSuccess = document.getElementById('formSuccess');
    const successReset = document.getElementById('successReset');

    // Float labels checking fallback
    const inputs = [formName, formBusiness, formPhone, formEmail, formMessage];
    inputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', () => {
            if (input.value.trim() !== "") {
                input.setAttribute('placeholder', ' '); // Keeps HTML placeholder-shown logic active
            }
        });
    });

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    }

    function validatePhone(phone) {
        // Simple numeric verification (min 8 digits)
        const digits = phone.replace(/\D/g, "");
        return digits.length >= 8;
    }

    function showInputError(input, isValid) {
        const group = input.closest('.form-group');
        if (!group) return;
        if (isValid) {
            group.classList.remove('invalid');
        } else {
            group.classList.add('invalid');
        }
    }

    // Validate inputs live on blur
    if (formName) {
        formName.addEventListener('blur', () => {
            showInputError(formName, formName.value.trim() !== "");
        });
    }
    if (formBusiness) {
        formBusiness.addEventListener('blur', () => {
            showInputError(formBusiness, formBusiness.value.trim() !== "");
        });
    }
    if (formPhone) {
        formPhone.addEventListener('blur', () => {
            showInputError(formPhone, validatePhone(formPhone.value.trim()));
        });
    }
    if (formEmail) {
        formEmail.addEventListener('blur', () => {
            showInputError(formEmail, validateEmail(formEmail.value.trim()));
        });
    }
    if (formProjectType) {
        formProjectType.addEventListener('change', () => {
            showInputError(formProjectType, formProjectType.value !== "");
        });
    }
    if (formBudget) {
        formBudget.addEventListener('change', () => {
            showInputError(formBudget, formBudget.value !== "");
        });
    }
    if (formMessage) {
        formMessage.addEventListener('blur', () => {
            showInputError(formMessage, formMessage.value.trim() !== "");
        });
    }

    if (bookingForm) {
        bookingForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Perform final validation checks
            const isNameValid = formName.value.trim() !== "";
            const isBusinessValid = formBusiness.value.trim() !== "";
            const isPhoneValid = validatePhone(formPhone.value.trim());
            const isEmailValid = validateEmail(formEmail.value.trim());
            const isProjectTypeValid = formProjectType.value !== "";
            const isBudgetValid = formBudget.value !== "";
            const isMessageValid = formMessage.value.trim() !== "";

            showInputError(formName, isNameValid);
            showInputError(formBusiness, isBusinessValid);
            showInputError(formPhone, isPhoneValid);
            showInputError(formEmail, isEmailValid);
            showInputError(formProjectType, isProjectTypeValid);
            showInputError(formBudget, isBudgetValid);
            showInputError(formMessage, isMessageValid);

            if (isNameValid && isBusinessValid && isPhoneValid && isEmailValid && isProjectTypeValid && isBudgetValid && isMessageValid) {
                // Show loading state on submit button
                const submitBtn = bookingForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Scheduling Consultation...';

                // Submit Form details using FormSubmit AJAX Endpoint
                fetch("https://formsubmit.co/ajax/arunc@acsoft.online", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    body: JSON.stringify({
                        name: formName.value,
                        business: formBusiness.value,
                        phone: formPhone.value,
                        email: formEmail.value,
                        project_type: formProjectType.value,
                        budget: formBudget.value,
                        message: formMessage.value
                    })
                })
                .then(response => response.json())
                .then(data => {
                    // Reset form fields
                    bookingForm.reset();
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;

                    // Display success screen
                    bookingForm.classList.add('hide');
                    formSuccess.classList.add('active');
                })
                .catch(error => {
                    console.error("Submission error:", error);
                    // Fallback to visual success state in case of connection blocks
                    bookingForm.reset();
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    bookingForm.classList.add('hide');
                    formSuccess.classList.add('active');
                });
            }
        });
    }

    if (successReset) {
        successReset.addEventListener('click', () => {
            bookingForm.classList.remove('hide');
            formSuccess.classList.remove('active');
            
            // Reset floating labels placeholders
            inputs.forEach(input => {
                if (input) input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }
});
