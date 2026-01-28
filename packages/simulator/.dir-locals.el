((nil . ((eval . (defun my/csdocker-compile (var)
                   "Run compile command inside csdocker."
                   (interactive "scsdocker-compile: ")
                   (let* ((cmd (format
                                "docker run --rm -ti --dns 1.1.1.1 \
-v $PWD:/home/csdocker/shared \
--entrypoint /bin/bash csdocker \
-c \"cd .. && %s\""
                                var)))
                     (compile cmd)))))))
